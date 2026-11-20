import { describe, expect, it } from "vitest";
import { shouldShowPollError } from "./poll";

describe("shouldShowPollError", () => {
  it("does not flag a single blip below the threshold", () => {
    expect(shouldShowPollError(1, 2)).toBe(false);
  });

  it("flags once consecutive failures reach the threshold", () => {
    expect(shouldShowPollError(2, 2)).toBe(true);
  });

  it("stays flagged if failures keep climbing past the threshold", () => {
    expect(shouldShowPollError(5, 2)).toBe(true);
  });

  it("never flags on zero failures", () => {
    expect(shouldShowPollError(0, 2)).toBe(false);
  });
});
