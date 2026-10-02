import {
  AuctionEndedError,
  AuctionNotActiveError,
  AuctionNotFoundError,
  BidTooLowError,
  InvalidBidError,
  SelfBidError,
} from "./errors.js";
import {
  applyAntiSniping,
  DEFAULT_ANTI_SNIPING_POLICIES,
  policyForKind,
  type AntiSnipingPolicies,
} from "./anti-sniping.js";
import type {
  AuctionEventBus,
  AuctionRecord,
  AuctionStore,
  Clock,
  CloseSweepResult,
  PlaceBidInput,
  PlaceBidResult,
} from "./types.js";

const SYSTEM_CLOCK: Clock = {
  now: () => new Date(),
};

const NOOP_EVENTS: AuctionEventBus = {
  publish: () => undefined,
};

export interface AuctionEngineOptions {
  clock?: Clock;
  eventBus?: AuctionEventBus;
  antiSniping?: AntiSnipingPolicies;
}

/**
 * Framework-agnostic auction core.
 *
 * Correctness depends on AuctionStore.withLockedAuction() truly serializing
 * writes for one auction. For PostgreSQL, use a transaction plus
 * SELECT ... FOR UPDATE. Events are emitted only after that transaction
 * resolves, so clients never observe a bid that later rolls back.
 */
export class AuctionEngine {
  private readonly clock: Clock;
  private readonly eventBus: AuctionEventBus;
  private readonly antiSniping: AntiSnipingPolicies;

  constructor(
    private readonly store: AuctionStore,
    options: AuctionEngineOptions = {},
  ) {
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.eventBus = options.eventBus ?? NOOP_EVENTS;
    this.antiSniping =
      options.antiSniping ?? DEFAULT_ANTI_SNIPING_POLICIES;
  }

  async placeBid(input: PlaceBidInput): Promise<PlaceBidResult> {
    if (input.amountMinor <= 0n) throw new InvalidBidError();
    if (!input.auctionId || !input.bidderId) throw new InvalidBidError();

    const now = this.clock.now();

    const result = await this.store.withLockedAuction(
      input.auctionId,
      async (tx): Promise<PlaceBidResult> => {
        const auction = await tx.getAuction();
        if (!auction) throw new AuctionNotFoundError();
        if (auction.sellerId === input.bidderId) throw new SelfBidError();
        if (auction.status !== "active") throw new AuctionNotActiveError();
        if (now.getTime() >= auction.endAt.getTime()) {
          throw new AuctionEndedError();
        }

        const minimumAcceptedMinor =
          auction.currentBidMinor + auction.bidIncrementMinor;
        if (input.amountMinor < minimumAcceptedMinor) {
          throw new BidTooLowError(minimumAcceptedMinor);
        }

        const previousHighestBidderId = auction.highestBidderId ?? null;
        const policy = policyForKind(auction.kind, this.antiSniping);
        const antiSnipe = applyAntiSniping({
          endAt: auction.endAt,
          extensionCount: auction.extensionCount,
          now,
          policy,
        });

        const bid = await tx.insertBid({
          auctionId: auction.id,
          bidderId: input.bidderId,
          amountMinor: input.amountMinor,
          createdAt: now,
        });

        const updated = await tx.updateAuction({
          currentBidMinor: input.amountMinor,
          highestBidderId: input.bidderId,
          bidCount: auction.bidCount + 1,
          endAt: antiSnipe.endAt,
          extensionCount: antiSnipe.extensionCount,
        });

        return {
          bid,
          auction: updated,
          minimumAcceptedMinor,
          extended: antiSnipe.extended,
          previousHighestBidderId,
        };
      },
    );

    // Important: this happens after the transaction/lock callback has resolved.
    await this.eventBus.publish({
      type: "auction.bidPlaced",
      auctionId: result.auction.id,
      bidId: result.bid.id,
      bidderId: result.bid.bidderId,
      previousHighestBidderId: result.previousHighestBidderId,
      amountMinor: result.bid.amountMinor.toString(),
      currentBidMinor: result.auction.currentBidMinor.toString(),
      endAt: result.auction.endAt.toISOString(),
      extended: result.extended,
      emittedAt: this.clock.now().toISOString(),
    });

    return result;
  }

  async closeExpiredAuctions(limit = 100): Promise<CloseSweepResult> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError("limit must be a positive integer");
    }

    const now = this.clock.now();
    const ids = await this.store.listExpiredActiveAuctionIds(now, limit);
    const summary: CloseSweepResult = {
      scanned: ids.length,
      sold: 0,
      ended: 0,
      skipped: 0,
    };

    for (const auctionId of ids) {
      const closed = await this.store.withLockedAuction(
        auctionId,
        async (tx): Promise<AuctionRecord | null> => {
          const auction = await tx.getAuction();
          if (
            !auction ||
            auction.status !== "active" ||
            auction.endAt.getTime() > now.getTime()
          ) {
            return null;
          }

          const reserveMet =
            auction.bidCount > 0 &&
            (auction.reservePriceMinor == null ||
              auction.currentBidMinor >= auction.reservePriceMinor);
          const hasWinner =
            reserveMet && typeof auction.highestBidderId === "string";

          return tx.updateAuction({ status: hasWinner ? "sold" : "ended" });
        },
      );

      if (!closed) {
        summary.skipped += 1;
        continue;
      }

      if (closed.status === "sold") summary.sold += 1;
      else summary.ended += 1;

      await this.eventBus.publish({
        type: "auction.closed",
        auctionId: closed.id,
        status: closed.status === "sold" ? "sold" : "ended",
        winnerId:
          closed.status === "sold" ? (closed.highestBidderId ?? null) : null,
        finalBidMinor: closed.currentBidMinor.toString(),
        emittedAt: this.clock.now().toISOString(),
      });
    }

    return summary;
  }
}
