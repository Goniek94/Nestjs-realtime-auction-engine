/**
 * Example only — excluded from the package build.
 *
 * The engine is framework-agnostic, so NestJS integration is intentionally
 * thin. Bind your production AuctionStore implementation and expose the engine
 * from a provider.
 */
import { Injectable, Module } from "@nestjs/common";
import {
  AuctionEngine,
  type AuctionStore,
  SocketIoAuctionEventBus,
} from "nestjs-realtime-auction-engine";

@Injectable()
class AuctionStoreAdapter {
  // Implement AuctionStore with your ORM/database.
  // PostgreSQL adapters should use SELECT ... FOR UPDATE in withLockedAuction().
}

@Injectable()
class AuctionEngineProvider {
  readonly engine: AuctionEngine;

  constructor(store: AuctionStoreAdapter) {
    this.engine = new AuctionEngine(store as unknown as AuctionStore);
  }
}

@Module({
  providers: [AuctionStoreAdapter, AuctionEngineProvider],
  exports: [AuctionEngineProvider],
})
export class AuctionsInfrastructureModule {}

void SocketIoAuctionEventBus;
