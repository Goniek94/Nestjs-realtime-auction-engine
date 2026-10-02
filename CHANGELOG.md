# Changelog

## 0.1.0 - 2026-10-02

Initial public extraction of the reusable auction core:

- serialized bid placement contract,
- bigint minor-unit money model,
- anti-sniping with hard extension caps,
- standard vs. live-auction policies,
- close-expired sweep with reserve handling,
- post-commit event publishing,
- Socket.IO-compatible event adapter,
- PostgreSQL advisory cron lock,
- in-memory transactional reference store,
- concurrency and reserve-price tests.
