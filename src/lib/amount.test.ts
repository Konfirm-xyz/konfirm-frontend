import { describe, expect, it } from "vitest";
import { parseAmount } from "./amount";

describe("parseAmount", () => {
  it("parses a plain integer", () => {
    expect(parseAmount("100")).toBe(100);
  });

  it("parses US-style grouping with a dollar sign", () => {
    expect(parseAmount("$1,234.56")).toBeCloseTo(1234.56);
  });

  it("parses EU-style grouping (dot thousands, comma decimal)", () => {
    expect(parseAmount("1.234,56")).toBeCloseTo(1234.56);
  });

  it("parses EU-style grouping with a space thousands separator", () => {
    expect(parseAmount("1 234,56")).toBeCloseTo(1234.56);
  });

  it("treats a lone two-digit comma as a decimal separator", () => {
    expect(parseAmount("12,50")).toBeCloseTo(12.5);
  });

  it("treats a lone three-digit comma group as a thousands separator", () => {
    expect(parseAmount("12,500")).toBe(12500);
  });

  it("collapses multiple dots as EU thousands separators", () => {
    expect(parseAmount("1.234.567")).toBe(1234567);
  });

  // Malformed input: empty, whitespace-only, and non-numeric garbage must
  // all fail closed (null), never silently coerce to 0 or NaN that a caller
  // forgets to guard against.
  it("rejects empty input", () => {
    expect(parseAmount("")).toBeNull();
  });

  it("rejects whitespace-only input", () => {
    expect(parseAmount("   ")).toBeNull();
  });

  it("rejects non-numeric garbage", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("free money")).toBeNull();
  });

  it("rejects a value that is only symbols", () => {
    expect(parseAmount("$€")).toBeNull();
  });
});
