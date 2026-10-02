# NestJS Realtime Auction Engine

Reusable, concurrency-safe auction primitives for TypeScript and NestJS applications.

The project is based on engineering patterns developed while building **MatchDays**, a working sports collectibles marketplace. The commercial MatchDays application remains private; this repository extracts only generic infrastructure that can be useful to other developers.

Production reference: **https://www.matchdays.store/**

## Why this exists

Auction code looks simple until two people bid at the same time.

A production implementation has to answer questions such as:

- Can two requests both read the same current price and create tied winning bids?
- Can a seller bid on their own listing?
- What happens when a bid lands in the final seconds?
- Can repeated anti-sniping extensions keep an auction alive forever?
- Can clients receive a realtime bid event for a database transaction that later rolls back?
- Can several application replicas run the same auction-closing cron at once?
- Can a reserve-price auction be marked sold below its reserve?
- Can money comparisons lose a cent because of floating-point arithmetic?

This package makes those rules explicit and testable.

## Current status

**v0.1.0** is an early public extraction. The core is intentionally framework-agnostic and has zero runtime dependencies. NestJS, Prisma/PostgreSQL and Socket.IO are integration layers around it.

Implemented today:

- serialized bid placement through a storage lock contract,
- safe integer minor-unit money (`bigint`),
- minimum-bid validation,
- self-bid prevention,
- deterministic anti-sniping,
- hard extension caps,
- separate standard/live policies,
- reserve-aware auction closing,
- event publishing after transaction commit,
- Socket.IO-compatible event bus,
- PostgreSQL advisory lock helper for multi-replica cron jobs,
- transactional in-memory adapter,
- concurrency tests.

## Install

```bash
npm install nestjs-realtime-auction-engine
```

Until the first npm release, install directly from GitHub after the repository is published:

```bash
npm install github:Goniek94/nestjs-realtime-auction-engine
```

## Quick start

```ts
import {
  AuctionEngine,
  InMemoryAuctionStore,
  MemoryAuctionEventBus,
} from "nestjs-realtime-auction-engine";

const store = new InMemoryAuctionStore([
  {
    id: "auction-1",
    sellerId: "seller-1",
    status: "active",
    kind: "standard",
    startAt: new Date("2026-10-02T17:00:00Z"),
    endAt: new Date("2026-10-02T19:00:00Z"),
    currentBidMinor: 10_000n, // EUR 100.00
    bidIncrementMinor: 500n,  // EUR 5.00
    reservePriceMinor: null,
    bidCount: 0,
    extensionCount: 0,
    highestBidderId: null,
  },
]);

const eventBus = new MemoryAuctionEventBus();
const engine = new AuctionEngine(store, { eventBus });

await engine.placeBid({
  auctionId: "auction-1",
  bidderId: "buyer-1",
  amountMinor: 10_500n,
});
```

## The concurrency contract

The most important interface is `AuctionStore.withLockedAuction()`.

```ts
interface AuctionStore {
  withLockedAuction<T>(
    auctionId: string,
    work: (tx: AuctionTransaction) => Promise<T>,
  ): Promise<T>;
}
```

A production adapter **must serialize mutations for the same auction**.

For PostgreSQL, the recommended pattern is:

```sql
BEGIN;

SELECT id
FROM auctions
WHERE id = $1
FOR UPDATE;

-- read current bid, validate, insert bid, update auction

COMMIT;
```

This prevents two concurrent bidders from both reading price X and both being accepted at `X + increment`.

See `examples/prisma-postgres-store.ts` for an adapter sketch.

## Money: no floating point

The engine uses minor units as `bigint`.

```ts
100_00n // EUR 100.00
  + 1n  // EUR 0.01
```

That avoids classic floating-point edge cases such as `99.99 + 0.01` not being represented exactly in binary floating point.

Currency formatting belongs in the application layer.

## Anti-sniping

Default standard-auction policy:

- late-bid window: 5 minutes,
- extension: 5 minutes,
- maximum extensions: 12.

```ts
import { DEFAULT_ANTI_SNIPING_POLICIES } from "nestjs-realtime-auction-engine";
```

A hard cap matters. Without one, two bidders repeatedly trading bids near the close can keep pushing the auction indefinitely.

Live auctions use a separate policy and default to **no automatic extension**.

Policies are configurable:

```ts
const engine = new AuctionEngine(store, {
  antiSniping: {
    standard: {
      windowMs: 2 * 60_000,
      extensionMs: 2 * 60_000,
      maxExtensions: 10,
    },
    live: {
      windowMs: 0,
      extensionMs: 0,
      maxExtensions: 0,
    },
  },
});
```

## Realtime events happen after commit

The engine publishes `auction.bidPlaced` only after `withLockedAuction()` resolves successfully.

That ordering is deliberate. Broadcasting from inside an open database transaction can create a phantom bid in connected clients if the transaction subsequently rolls back.

Available events in v0.1:

- `auction.bidPlaced`
- `auction.closed`

### Socket.IO

The included adapter is structural and does not require Socket.IO as a package dependency:

```ts
import { SocketIoAuctionEventBus } from "nestjs-realtime-auction-engine";

const eventBus = new SocketIoAuctionEventBus(ioServer);
const engine = new AuctionEngine(store, { eventBus });
```

By default it broadcasts to `auction_<id>` rooms and emits a targeted `auction.outbid` event to `user_<id>` when the previous leader is displaced.

## Closing expired auctions

```ts
const result = await engine.closeExpiredAuctions(100);
```

Every candidate is re-read under the auction lock before its state is changed. This protects against stale cron scans and concurrent updates.

Behavior:

- no bids -> `ended`,
- bids + no reserve -> `sold`,
- bids + reserve met -> `sold`,
- bids + reserve not met -> `ended`.

Order creation, payment settlement and wallet release intentionally remain application concerns.

## Multi-replica cron coordination

Running NestJS Scheduler in three replicas means three independent cron ticks. Use the included PostgreSQL advisory-lock helper to make a scheduled task cluster-safe:

```ts
import { PostgresAdvisoryCronLock } from "nestjs-realtime-auction-engine";

const lock = new PostgresAdvisoryCronLock(pgPool);

await lock.tryRun("auctions.closeExpired", async () => {
  await engine.closeExpiredAuctions();
});
```

The helper uses a transaction-scoped advisory lock and returns `false` immediately when another replica already owns the tick.

## NestJS integration

The core deliberately does not require `@nestjs/common`, which keeps the package usable outside NestJS and avoids forcing framework versions on consumers.

In NestJS, expose `AuctionEngine` from a provider and bind your own `AuctionStore` adapter. See `examples/nestjs-integration.ts`.

## What is intentionally not included

This project is **not** a turnkey marketplace backend. It does not implement:

- authentication,
- seller onboarding,
- payment custody or escrow,
- shipping,
- moderation,
- disputes,
- KYC/KYB,
- tax or regulatory compliance.

Those concerns vary significantly by marketplace and jurisdiction. The package focuses on reusable auction mechanics and consistency boundaries.

## Security

Concurrency is a security and financial-integrity concern in auction software. A broken storage adapter can invalidate the engine's guarantees.

Before production use:

- implement a real row lock,
- keep authorization in the application layer,
- validate auction visibility separately from auction mutability,
- rate-limit HTTP and WebSocket surfaces,
- never trust client-provided seller/winner state,
- add payment-specific idempotency independently of auction locking.

See [SECURITY.md](./SECURITY.md).

## Roadmap

Planned areas for future releases:

- reference Prisma/PostgreSQL adapter package,
- Redis-backed distributed event transport,
- proxy bidding / max-bid strategy,
- optimistic-read helpers,
- auction lifecycle hooks,
- OpenTelemetry instrumentation,
- load-test fixtures for high-contention bidding,
- richer NestJS integration package.

## Origin

The ideas in this repository come from real problems encountered while building **MatchDays**: a sports collectibles marketplace with realtime auctions and marketplace transaction flows.

The goal is not to publish MatchDays' business logic. The goal is to extract the generic engineering patterns so other developers do not have to rediscover the same race conditions and auction edge cases from scratch.

## Contributing

Issues and pull requests are welcome. Please include tests for behavior changes, especially around concurrency, timing and state transitions.

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
