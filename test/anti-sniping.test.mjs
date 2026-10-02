import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAntiSniping,
  DEFAULT_ANTI_SNIPING_POLICIES,
} from "../dist/esm/index.js";

test("extends a standard auction inside the anti-sniping window", () => {
  const now = new Date("2026-10-02T18:00:00.000Z");
  const endAt = new Date("2026-10-02T18:02:00.000Z");
  const result = applyAntiSniping({
    now,
    endAt,
    extensionCount: 0,
    policy: DEFAULT_ANTI_SNIPING_POLICIES.standard,
  });

  assert.equal(result.extended, true);
  assert.equal(result.extensionCount, 1);
  assert.equal(result.endAt.toISOString(), "2026-10-02T18:07:00.000Z");
});

test("stops extending once the cap is reached", () => {
  const now = new Date("2026-10-02T18:00:00.000Z");
  const endAt = new Date("2026-10-02T18:02:00.000Z");
  const policy = DEFAULT_ANTI_SNIPING_POLICIES.standard;
  const result = applyAntiSniping({
    now,
    endAt,
    extensionCount: policy.maxExtensions,
    policy,
  });

  assert.equal(result.extended, false);
  assert.equal(result.endAt.toISOString(), endAt.toISOString());
});

test("live auctions are not extended by default", () => {
  const now = new Date("2026-10-02T18:00:00.000Z");
  const endAt = new Date("2026-10-02T18:00:10.000Z");
  const result = applyAntiSniping({
    now,
    endAt,
    extensionCount: 0,
    policy: DEFAULT_ANTI_SNIPING_POLICIES.live,
  });

  assert.equal(result.extended, false);
});
