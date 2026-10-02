import type { AuctionEvent, AuctionEventBus } from "../core/types.js";

export class MemoryAuctionEventBus implements AuctionEventBus {
  readonly events: AuctionEvent[] = [];

  publish(event: AuctionEvent): void {
    this.events.push(event);
  }
}
