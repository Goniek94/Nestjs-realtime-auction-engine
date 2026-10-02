import type { AuctionEvent, AuctionEventBus } from "../core/types.js";

export interface SocketRoomEmitterLike {
  emit(eventName: string, payload: unknown): unknown;
}

export interface SocketServerLike {
  to(room: string): SocketRoomEmitterLike;
}

export interface SocketIoAuctionEventBusOptions {
  auctionRoom?: (auctionId: string) => string;
  userRoom?: (userId: string) => string;
}

/**
 * Tiny structural adapter: no hard dependency on socket.io is required.
 * A real Socket.IO Server satisfies this interface.
 */
export class SocketIoAuctionEventBus implements AuctionEventBus {
  private readonly auctionRoom: (auctionId: string) => string;
  private readonly userRoom: (userId: string) => string;

  constructor(
    private readonly server: SocketServerLike,
    options: SocketIoAuctionEventBusOptions = {},
  ) {
    this.auctionRoom = options.auctionRoom ?? ((id) => `auction_${id}`);
    this.userRoom = options.userRoom ?? ((id) => `user_${id}`);
  }

  publish(event: AuctionEvent): void {
    this.server
      .to(this.auctionRoom(event.auctionId))
      .emit(event.type, event);

    if (
      event.type === "auction.bidPlaced" &&
      event.previousHighestBidderId &&
      event.previousHighestBidderId !== event.bidderId
    ) {
      this.server
        .to(this.userRoom(event.previousHighestBidderId))
        .emit("auction.outbid", {
          auctionId: event.auctionId,
          newAmountMinor: event.amountMinor,
          emittedAt: event.emittedAt,
        });
    }
  }
}
