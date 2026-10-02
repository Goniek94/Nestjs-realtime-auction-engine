import type {
  AuctionPatch,
  AuctionRecord,
  AuctionStore,
  AuctionTransaction,
  BidRecord,
  NewBid,
} from "../core/types.js";

function cloneAuction(auction: AuctionRecord): AuctionRecord {
  return {
    ...auction,
    startAt: new Date(auction.startAt),
    endAt: new Date(auction.endAt),
  };
}

/**
 * Deterministic reference adapter for tests, examples and local prototypes.
 * It provides rollback semantics by mutating a transaction-local clone and
 * committing it only when the callback resolves successfully.
 */
export class InMemoryAuctionStore implements AuctionStore {
  private readonly auctions = new Map<string, AuctionRecord>();
  private readonly bids = new Map<string, BidRecord[]>();
  private readonly tails = new Map<string, Promise<void>>();
  private bidSequence = 0;

  constructor(seed: AuctionRecord[] = []) {
    for (const auction of seed) this.auctions.set(auction.id, cloneAuction(auction));
  }

  getAuction(id: string): AuctionRecord | null {
    const auction = this.auctions.get(id);
    return auction ? cloneAuction(auction) : null;
  }

  getBids(auctionId: string): BidRecord[] {
    return (this.bids.get(auctionId) ?? []).map((bid) => ({
      ...bid,
      createdAt: new Date(bid.createdAt),
    }));
  }

  async listExpiredActiveAuctionIds(now: Date, limit: number): Promise<string[]> {
    return [...this.auctions.values()]
      .filter(
        (auction) =>
          auction.status === "active" &&
          auction.endAt.getTime() <= now.getTime(),
      )
      .sort((a, b) => a.endAt.getTime() - b.endAt.getTime())
      .slice(0, limit)
      .map((auction) => auction.id);
  }

  async withLockedAuction<T>(
    auctionId: string,
    work: (tx: AuctionTransaction) => Promise<T>,
  ): Promise<T> {
    const release = await this.acquire(auctionId);
    try {
      const existing = this.auctions.get(auctionId);
      let localAuction = existing ? cloneAuction(existing) : null;
      const localBids: BidRecord[] = [];

      const tx: AuctionTransaction = {
        getAuction: async () =>
          localAuction ? cloneAuction(localAuction) : null,

        insertBid: async (bid: NewBid) => {
          const stored: BidRecord = {
            id: `bid-${++this.bidSequence}`,
            ...bid,
            createdAt: new Date(bid.createdAt),
          };
          localBids.push(stored);
          return { ...stored, createdAt: new Date(stored.createdAt) };
        },

        updateAuction: async (patch: AuctionPatch) => {
          if (!localAuction) throw new Error("Auction does not exist");
          localAuction = {
            ...localAuction,
            ...patch,
            endAt: patch.endAt
              ? new Date(patch.endAt)
              : new Date(localAuction.endAt),
          };
          return cloneAuction(localAuction);
        },
      };

      const result = await work(tx);

      // Commit only after successful completion.
      if (localAuction) this.auctions.set(auctionId, cloneAuction(localAuction));
      if (localBids.length > 0) {
        const current = this.bids.get(auctionId) ?? [];
        this.bids.set(auctionId, [...current, ...localBids]);
      }

      return result;
    } finally {
      release();
    }
  }

  private async acquire(key: string): Promise<() => void> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let unlock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });

    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;

    return () => {
      unlock();
      void tail.finally(() => {
        if (this.tails.get(key) === tail) this.tails.delete(key);
      });
    };
  }
}
