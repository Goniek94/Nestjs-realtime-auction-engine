// Runs as CommonJS (the default for NestJS apps) and resolves through the
// package "exports" map, so it covers both the require() build and ./nestjs.
require("reflect-metadata");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Test } = require("@nestjs/testing");
const {
  AuctionEngine,
  InMemoryAuctionStore,
} = require("nestjs-realtime-auction-engine");
const { AuctionEngineModule } = require("nestjs-realtime-auction-engine/nestjs");

const seed = () => [
  {
    id: "auc-1",
    sellerId: "seller-1",
    status: "active",
    kind: "standard",
    startAt: new Date("2026-10-02T17:00:00.000Z"),
    endAt: new Date("2026-10-02T19:00:00.000Z"),
    currentBidMinor: 10_000n,
    bidIncrementMinor: 500n,
    reservePriceMinor: null,
    bidCount: 0,
    extensionCount: 0,
    highestBidderId: null,
  },
];
const clock = { now: () => new Date("2026-10-02T18:00:00.000Z") };

test("require() resolves the CommonJS build", () => {
  assert.equal(typeof AuctionEngine, "function");
});

test("AuctionEngineModule.forRoot provides an injectable AuctionEngine", async () => {
  const store = new InMemoryAuctionStore(seed());
  const moduleRef = await Test.createTestingModule({
    imports: [AuctionEngineModule.forRoot({ store, clock })],
  }).compile();

  const engine = moduleRef.get(AuctionEngine);
  assert.ok(engine instanceof AuctionEngine);
  await engine.placeBid({ auctionId: "auc-1", bidderId: "buyer-1", amountMinor: 10_000n });
  assert.equal(store.getAuction("auc-1").bidCount, 1);
});

test("AuctionEngineModule.forRootAsync resolves options from a factory", async () => {
  const store = new InMemoryAuctionStore(seed());
  const moduleRef = await Test.createTestingModule({
    imports: [
      AuctionEngineModule.forRootAsync({
        useFactory: async () => ({ store, clock }),
      }),
    ],
  }).compile();

  const engine = moduleRef.get(AuctionEngine);
  const result = await engine.placeBid({
    auctionId: "auc-1",
    bidderId: "buyer-1",
    amountMinor: 10_000n,
  });
  assert.equal(result.auction.currentBidMinor, 10_000n);
});
