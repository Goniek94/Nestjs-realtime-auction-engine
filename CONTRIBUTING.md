# Contributing

Thanks for considering a contribution.

## Development

```bash
npm install
npm run check
```

Pull requests should include tests for behavioral changes. For concurrency
changes, describe the race being prevented and why the chosen lock/transaction
boundary is sufficient.

## Scope

The project focuses on reusable auction infrastructure:

- concurrency-safe bidding,
- deterministic anti-sniping,
- auction closing,
- realtime event delivery,
- scheduler coordination.

Marketplace-specific payments, shipping, moderation and account policy should
remain adapters or application-level concerns.
