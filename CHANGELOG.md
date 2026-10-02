# Changelog

## 0.1.0 - 2026-10-02

Initial public extraction of the reusable auction core:

- serialized bid placement contract,
- bigint minor-unit money model,
- first bid may match the starting price; later bids require an increment,
- anti-sniping with hard extension caps,
- standard vs. live-auction policies,
- close-expired sweep with reserve handling and per-auction failure isolation,
- post-commit event publishing; publish failures are reported via `onError`
  instead of rejecting an already committed bid,
- Socket.IO-compatible event adapter,
- PostgreSQL advisory cron lock,
- in-memory transactional reference store,
- `AuctionEngineModule` for NestJS (`nestjs-realtime-auction-engine/nestjs`),
- dual ESM + CommonJS build,
- concurrency, reserve-price, failure-isolation and NestJS tests.
