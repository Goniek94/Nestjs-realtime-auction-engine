/**
 * Sketch of the important production pattern. Adapt model/table names to your
 * own Prisma schema. The key property is that the auction row is locked before
 * reading the current bid and remains locked until the transaction commits.
 */
import type {
  AuctionPatch,
  AuctionRecord,
  AuctionStore,
  AuctionTransaction,
  NewBid,
} from "nestjs-realtime-auction-engine";

export class PrismaPostgresAuctionStore implements AuctionStore {
  constructor(private readonly prisma: any) {}

  async withLockedAuction<T>(
    auctionId: string,
    work: (tx: AuctionTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (db: any) => {
      const rows = await db.$queryRaw`
        SELECT id
        FROM "auctions"
        WHERE id = ${auctionId}
        FOR UPDATE
      `;

      if (!rows[0]) {
        return work({
          getAuction: async () => null,
          insertBid: async () => {
            throw new Error("Auction does not exist");
          },
          updateAuction: async () => {
            throw new Error("Auction does not exist");
          },
        });
      }

      const tx: AuctionTransaction = {
        getAuction: async () => mapAuction(await db.auction.findUnique({ where: { id: auctionId } })),
        insertBid: async (bid: NewBid) => {
          const row = await db.bid.create({ data: bid });
          return row;
        },
        updateAuction: async (patch: AuctionPatch) => {
          const row = await db.auction.update({ where: { id: auctionId }, data: patch });
          return mapAuction(row);
        },
      };

      return work(tx);
    });
  }

  async listExpiredActiveAuctionIds(now: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.auction.findMany({
      where: { status: "active", endAt: { lte: now } },
      orderBy: { endAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((row: { id: string }) => row.id);
  }
}

function mapAuction(row: any): AuctionRecord {
  return {
    id: row.id,
    sellerId: row.sellerId,
    status: row.status,
    kind: row.kind,
    startAt: row.startAt,
    endAt: row.endAt,
    currentBidMinor: BigInt(row.currentBidMinor),
    bidIncrementMinor: BigInt(row.bidIncrementMinor),
    reservePriceMinor: row.reservePriceMinor == null ? null : BigInt(row.reservePriceMinor),
    bidCount: row.bidCount,
    extensionCount: row.extensionCount,
    highestBidderId: row.highestBidderId,
  };
}
