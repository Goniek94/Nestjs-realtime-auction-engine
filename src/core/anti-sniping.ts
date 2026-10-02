import type { AuctionKind } from "./types.js";

export interface AntiSnipingPolicy {
  /** A bid is considered late when remaining time is below this value. */
  windowMs: number;
  /** Amount added to the current scheduled end time. */
  extensionMs: number;
  /** Hard cap preventing an auction from being extended forever. */
  maxExtensions: number;
}

export interface AntiSnipingPolicies {
  standard: AntiSnipingPolicy;
  live: AntiSnipingPolicy;
}

export const DEFAULT_ANTI_SNIPING_POLICIES: AntiSnipingPolicies = {
  standard: {
    windowMs: 5 * 60 * 1000,
    extensionMs: 5 * 60 * 1000,
    maxExtensions: 12,
  },
  live: {
    windowMs: 0,
    extensionMs: 0,
    maxExtensions: 0,
  },
};

export function policyForKind(
  kind: AuctionKind,
  policies: AntiSnipingPolicies,
): AntiSnipingPolicy {
  return kind === "live" ? policies.live : policies.standard;
}

export function applyAntiSniping(params: {
  endAt: Date;
  extensionCount: number;
  now: Date;
  policy: AntiSnipingPolicy;
}): { endAt: Date; extensionCount: number; extended: boolean } {
  const { endAt, extensionCount, now, policy } = params;

  if (
    policy.windowMs <= 0 ||
    policy.extensionMs <= 0 ||
    policy.maxExtensions <= 0 ||
    extensionCount >= policy.maxExtensions
  ) {
    return {
      endAt: new Date(endAt),
      extensionCount,
      extended: false,
    };
  }

  const remainingMs = endAt.getTime() - now.getTime();
  if (remainingMs < 0 || remainingMs >= policy.windowMs) {
    return {
      endAt: new Date(endAt),
      extensionCount,
      extended: false,
    };
  }

  return {
    endAt: new Date(endAt.getTime() + policy.extensionMs),
    extensionCount: extensionCount + 1,
    extended: true,
  };
}
