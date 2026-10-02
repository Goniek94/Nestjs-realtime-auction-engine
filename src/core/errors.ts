export class AuctionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuctionError";
  }
}

export class AuctionNotFoundError extends AuctionError {
  constructor() {
    super("AUCTION_NOT_FOUND", "Auction not found");
  }
}

export class AuctionNotActiveError extends AuctionError {
  constructor() {
    super("AUCTION_NOT_ACTIVE", "Auction is not active");
  }
}

export class AuctionEndedError extends AuctionError {
  constructor() {
    super("AUCTION_ENDED", "Auction has already ended");
  }
}

export class SelfBidError extends AuctionError {
  constructor() {
    super("SELF_BID", "Seller cannot bid on their own auction");
  }
}

export class BidTooLowError extends AuctionError {
  constructor(public readonly minimumAcceptedMinor: bigint) {
    super(
      "BID_TOO_LOW",
      `Bid is below the minimum accepted amount: ${minimumAcceptedMinor.toString()}`,
    );
  }
}

export class InvalidBidError extends AuctionError {
  constructor() {
    super("INVALID_BID", "Bid amount must be greater than zero");
  }
}
