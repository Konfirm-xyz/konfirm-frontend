import { describe, expect, it } from "vitest";
import { friendlyMessage, randomMuxedId } from "./checkout";

describe("friendlyMessage", () => {
  it("passes through known-safe backend messages verbatim", () => {
    expect(friendlyMessage(new Error("This link is not active"))).toBe("This link is not active");
    expect(friendlyMessage(new Error("Link not found"))).toBe("Link not found");
  });

  it("rewrites a wallet rejection into a plain-language prompt", () => {
    expect(friendlyMessage(new Error("User declined access"))).toMatch(/approve the payment/i);
  });

  it("rewrites a missing/locked Freighter error without naming it as a bug", () => {
    expect(friendlyMessage(new Error("Freighter is not installed"))).toMatch(/wallet/i);
  });

  // Never leak internal terms (session/reconciler/screening) to the payer,
  // even for an error this function has never seen before.
  it("falls back to a generic message for an unrecognized error, never leaking internals", () => {
    const msg = friendlyMessage(new Error("reconciler: no matching session for muxed_id"));
    expect(msg).not.toMatch(/reconciler|session|screening/i);
    expect(msg).toBe("Something didn't go through on our end. Please try again.");
  });

  it("handles a non-Error thrown value", () => {
    expect(friendlyMessage("link has expired")).toBe("link has expired");
    expect(friendlyMessage(undefined)).toBe("Something didn't go through on our end. Please try again.");
  });
});

describe("randomMuxedId", () => {
  it("returns a non-negative integer string within the signed 64-bit range", () => {
    const id = randomMuxedId();
    expect(id).toMatch(/^\d+$/);
    const value = BigInt(id);
    expect(value).toBeGreaterThanOrEqual(0n);
    expect(value).toBeLessThanOrEqual(9223372036854775807n); // i64::MAX
  });

  it("is not trivially constant across calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => randomMuxedId()));
    expect(ids.size).toBeGreaterThan(1);
  });
});
