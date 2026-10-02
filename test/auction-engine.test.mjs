import test from "node:test";
import assert from "node:assert/strict";
import {
  AuctionEngine,
  BidTooLowError,
  InMemoryAuctionStore,
  MemoryAuctionEventBus,
  SelfBidError,
} from "../dist/esm/index.js";

function auction(overrides = {}) {
  return {
    id: "auc-1",
    sellerId: "seller-1",
    status: "active",
    kind: "standard",
    startAt: new Date("2026-10-02T17:00:00.000Z"),
    endAt: new Date("2026-10-02T18:02:00.000Z"),
    currentBidMinor: 10_000n,
    bidIncrementMinor: 500n,
    reservePriceMinor: null,
    bidCount: 0,
    extensionCount: 0,
    highestBidderId: null,
    ...overrides,
  };
}

const fixedClock = {
  now: () => new Date("2026-10-02T18:00:00.000Z"),
};

test("accepts minimum bid, extends late auction and emits after commit", async () => {
  const store = new InMemoryAuctionStore([auction()]);
  const events = new MemoryAuctionEventBus();
  const engine = new AuctionEngine(store, { clock: fixedClock, eventBus: events });

  const result = await engine.placeBid({
    auctionId: "auc-1",
    bidderId: "buyer-1",
    amountMinor: 10_500n,
  });

  assert.equal(result.extended, true);
  assert.equal(result.auction.currentBidMinor, 10_500n);
  assert.equal(result.auction.endAt.toISOString(), "2026-10-02T18:07:00.000Z");
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].type, "auction.bidPlaced");
});

test("rejects a seller bidding on their own auction", async () => {
  const store = new InMemoryAuctionStore([auction()]);
  const engine = new AuctionEngine(store, { clock: fixedClock });

  await assert.rejects(
    engine.placeBid({
      auctionId: "auc-1",
      bidderId: "seller-1",
      amountMinor: 10_500n,
    }),
    SelfBidError,
  );
});

test("serializes concurrent equal bids so exactly one succeeds", async () => {
  const store = new InMemoryAuctionStore([
    auction({ endAt: new Date("2026-10-02T19:00:00.000Z") }),
  ]);
  const engine = new AuctionEngine(store, { clock: fixedClock });

  const settled = await Promise.allSettled([
    engine.placeBid({
      auctionId: "auc-1",
      bidderId: "buyer-a",
      amountMinor: 10_500n,
    }),
    engine.placeBid({
      auctionId: "auc-1",
      bidderId: "buyer-b",
      amountMinor: 10_500n,
    }),
  ]);

  assert.equal(settled.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(settled.filter((x) => x.status === "rejected").length, 1);
  const rejection = settled.find((x) => x.status === "rejected");
  assert.ok(rejection.reason instanceof BidTooLowError);
  assert.equal(store.getBids("auc-1").length, 1);
});

test("closes below-reserve auction without a winner", async () => {
  const store = new InMemoryAuctionStore([
    auction({
      endAt: new Date("2026-10-02T17:59:00.000Z"),
      bidCount: 2,
      currentBidMinor: 12_000n,
      reservePriceMinor: 15_000n,
      highestBidderId: "buyer-1",
    }),
  ]);
  const events = new MemoryAuctionEventBus();
  const engine = new AuctionEngine(store, { clock: fixedClock, eventBus: events });

  const result = await engine.closeExpiredAuctions();
  assert.deepEqual(result, { scanned: 1, sold: 0, ended: 1, skipped: 0, failed: 0 });
  assert.equal(store.getAuction("auc-1").status, "ended");
  assert.equal(events.events.at(-1).type, "auction.closed");
});

test("closes reserve-met auction as sold", async () => {
  const store = new InMemoryAuctionStore([
    auction({
      endAt: new Date("2026-10-02T17:59:00.000Z"),
      bidCount: 2,
      currentBidMinor: 15_000n,
      reservePriceMinor: 15_000n,
      highestBidderId: "buyer-1",
    }),
  ]);
  const engine = new AuctionEngine(store, { clock: fixedClock });

  const result = await engine.closeExpiredAuctions();
  assert.equal(result.sold, 1);
  assert.equal(store.getAuction("auc-1").status, "sold");
});

test("first bid may match the starting price, later bids need an increment", async () => {
  const store = new InMemoryAuctionStore([
    auction({ endAt: new Date("2026-10-02T19:00:00.000Z") }),
  ]);
  const engine = new AuctionEngine(store, { clock: fixedClock });

  const first = await engine.placeBid({
    auctionId: "auc-1",
    bidderId: "buyer-1",
    amountMinor: 10_000n,
  });
  assert.equal(first.minimumAcceptedMinor, 10_000n);

  await assert.rejects(
    engine.placeBid({ auctionId: "auc-1", bidderId: "buyer-2", amountMinor: 10_000n }),
    (error) => error instanceof BidTooLowError && error.minimumAcceptedMinor === 10_500n,
  );
});

test("a failing event bus does not reject an already committed bid", async () => {
  const store = new InMemoryAuctionStore([auction()]);
  const reported = [];
  const engine = new AuctionEngine(store, {
    clock: fixedClock,
    eventBus: {
      publish: () => {
        throw new Error("socket down");
      },
    },
    onError: (error, context) => reported.push({ error, context }),
  });

  const result = await engine.placeBid({
    auctionId: "auc-1",
    bidderId: "buyer-1",
    amountMinor: 10_500n,
  });

  assert.equal(result.auction.currentBidMinor, 10_500n);
  assert.equal(store.getBids("auc-1").length, 1);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].context.phase, "publish");
});

test("one failing auction does not stop the close sweep", async () => {
  const store = new InMemoryAuctionStore([
    auction({ id: "broken", endAt: new Date("2026-10-02T17:58:00.000Z") }),
    auction({
      id: "ok",
      endAt: new Date("2026-10-02T17:59:00.000Z"),
      bidCount: 1,
      currentBidMinor: 12_000n,
      highestBidderId: "buyer-1",
    }),
  ]);
  const lockedStore = {
    listExpiredActiveAuctionIds: (now, limit) =>
      store.listExpiredActiveAuctionIds(now, limit),
    withLockedAuction: (auctionId, work) => {
      if (auctionId === "broken") throw new Error("deadlock detected");
      return store.withLockedAuction(auctionId, work);
    },
  };
  const reported = [];
  const engine = new AuctionEngine(lockedStore, {
    clock: fixedClock,
    onError: (error, context) => reported.push(context),
  });

  const result = await engine.closeExpiredAuctions();

  assert.deepEqual(result, { scanned: 2, sold: 1, ended: 0, skipped: 0, failed: 1 });
  assert.equal(store.getAuction("ok").status, "sold");
  assert.equal(store.getAuction("broken").status, "active");
  assert.deepEqual(reported, [{ phase: "close", auctionId: "broken" }]);
});
