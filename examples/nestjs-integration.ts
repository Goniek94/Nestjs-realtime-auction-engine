/**
 * Example only — excluded from the package build.
 *
 * Register AuctionEngineModule once, then inject AuctionEngine anywhere.
 * Bind your production AuctionStore (see prisma-postgres-store.ts) and,
 * optionally, a Socket.IO event bus from your gateway.
 */
import { Injectable, Logger, Module } from "@nestjs/common";
import {
  AuctionEngine,
  AuctionError,
  InMemoryAuctionStore,
} from "nestjs-realtime-auction-engine";
import { AuctionEngineModule } from "nestjs-realtime-auction-engine/nestjs";

const logger = new Logger("AuctionEngine");

@Injectable()
export class BidsService {
  constructor(private readonly engine: AuctionEngine) {}

  async placeBid(auctionId: string, bidderId: string, amountMinor: bigint) {
    try {
      return await this.engine.placeBid({ auctionId, bidderId, amountMinor });
    } catch (error) {
      // AuctionError carries a stable `code` (BID_TOO_LOW, SELF_BID, ...)
      // that maps cleanly onto HTTP 409/422 responses.
      if (error instanceof AuctionError) {
        logger.warn(`Rejected bid on ${auctionId}: ${error.code}`);
      }
      throw error;
    }
  }
}

@Module({
  imports: [
    AuctionEngineModule.forRootAsync({
      // imports: [PrismaModule],
      // inject: [PrismaService],
      useFactory: () => ({
        store: new InMemoryAuctionStore(), // replace with PrismaPostgresAuctionStore
        onError: (error, context) =>
          logger.error(`${context.phase} failed for ${context.auctionId}`, error),
      }),
    }),
  ],
  providers: [BidsService],
  exports: [BidsService],
})
export class AuctionsModule {}
