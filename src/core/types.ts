export type AuctionStatus =
  | "upcoming"
  | "active"
  | "ended"
  | "sold"
  | "cancelled";

export type AuctionKind = "standard" | "live";

/**
 * Monetary values are represented in minor units (for example cents) as bigint.
 * This deliberately avoids IEEE-754 floating-point errors in bidding logic.
 */
export type Money = bigint;

export interface AuctionRecord {
  id: string;
  sellerId: string;
  status: AuctionStatus;
  kind: AuctionKind;
  startAt: Date;
  endAt: Date;
  currentBidMinor: Money;
  bidIncrementMinor: Money;
  reservePriceMinor?: Money | null;
  bidCount: number;
  extensionCount: number;
  highestBidderId?: string | null;
}

export interface BidRecord {
  id: string;
  auctionId: string;
  bidderId: string;
  amountMinor: Money;
  createdAt: Date;
}

export interface NewBid {
  auctionId: string;
  bidderId: string;
  amountMinor: Money;
  createdAt: Date;
}

export interface AuctionPatch {
  currentBidMinor?: Money;
  bidCount?: number;
  extensionCount?: number;
  endAt?: Date;
  status?: AuctionStatus;
  highestBidderId?: string | null;
}

/**
 * A transaction bound to exactly one locked auction row.
 * Production adapters should acquire a database row lock before invoking work.
 */
export interface AuctionTransaction {
  getAuction(): Promise<AuctionRecord | null>;
  insertBid(bid: NewBid): Promise<BidRecord>;
  updateAuction(patch: AuctionPatch): Promise<AuctionRecord>;
}

export interface AuctionStore {
  /**
   * Serialize all mutations for one auction. In PostgreSQL this is typically
   * implemented with SELECT ... FOR UPDATE inside a transaction.
   */
  withLockedAuction<T>(
    auctionId: string,
    work: (tx: AuctionTransaction) => Promise<T>,
  ): Promise<T>;

  /** Return IDs only; each candidate is revalidated under a lock before close. */
  listExpiredActiveAuctionIds(now: Date, limit: number): Promise<string[]>;
}

export interface PlaceBidInput {
  auctionId: string;
  bidderId: string;
  amountMinor: Money;
}

export interface PlaceBidResult {
  bid: BidRecord;
  auction: AuctionRecord;
  minimumAcceptedMinor: Money;
  extended: boolean;
  previousHighestBidderId: string | null;
}

export interface CloseSweepResult {
  scanned: number;
  sold: number;
  ended: number;
  skipped: number;
  /** Auctions whose close transaction threw; reported through onError. */
  failed: number;
}

export type AuctionEvent =
  | {
      type: "auction.bidPlaced";
      auctionId: string;
      bidId: string;
      bidderId: string;
      previousHighestBidderId: string | null;
      amountMinor: string;
      currentBidMinor: string;
      endAt: string;
      extended: boolean;
      emittedAt: string;
    }
  | {
      type: "auction.closed";
      auctionId: string;
      status: "sold" | "ended";
      winnerId: string | null;
      finalBidMinor: string;
      emittedAt: string;
    };

export interface AuctionEventBus {
  publish(event: AuctionEvent): void | Promise<void>;
}

export interface Clock {
  now(): Date;
}
