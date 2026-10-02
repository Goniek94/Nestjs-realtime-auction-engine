# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could enable
unauthorized bidding, auction manipulation, data disclosure, or denial of
service.

Report the issue privately to the maintainer through GitHub's private
vulnerability reporting feature when available.

Include:

- affected version or commit,
- minimal reproduction,
- expected vs. actual behavior,
- security impact,
- suggested mitigation if known.

## Security model

This package deliberately treats the storage adapter as part of the trusted
computing base. A production `AuctionStore.withLockedAuction()` implementation
must serialize concurrent mutations for a single auction. On PostgreSQL, the
recommended implementation is a transaction plus `SELECT ... FOR UPDATE`.

The package does not implement authentication, authorization, payment custody,
or escrow. Applications remain responsible for those controls.
