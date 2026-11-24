// Amount parsing helpers shared by the send/new-payment flows.
//
// Inputs come from free-text fields, so we normalise common grouping styles
// (US `1,234.56`, EU `1.234,56`, space-separated `1 234,56`) before converting
// to a number. Anything we cannot confidently interpret fails closed (null)
// so callers never act on a silently coerced value.

/**
 * Largest amount we accept from user input. Kept well below
 * Number.MAX_SAFE_INTEGER so the string -> number conversion can never lose
 * precision, and so absurdly large values are rejected rather than silently
 * rounded.
 */
export const MAX_AMOUNT = 1_000_000_000_000; // 1 trillion

/**
 * Parse a user-entered amount string into a number.
 *
 * Returns null for empty, malformed, non-finite, or out-of-range input.
 */
export function parseAmount(input: string): number | null {
  if (typeof input !== "string") return null;

  // Strip currency symbols and whitespace (including non-breaking spaces).
  let s = input.replace(/[\s\u00a0]/g, "").replace(/[$€£¥]/g, "");
  if (s === "") return null;

  // Reject anything that still contains characters other than digits,
  // separators, or a leading sign.
  if (!/^[+-]?[0-9.,]+$/.test(s)) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Both present: whichever appears last is the decimal separator.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // EU style: dots are thousands, comma is decimal.
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US style: commas are thousands, dot is decimal.
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length !== 3) {
      // Lone comma with a non-three-digit tail is a decimal separator.
      s = s.replace(",", ".");
    } else {
      // Otherwise treat commas as thousands separators.
      s = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) {
      // Multiple dots with no comma: EU thousands separators.
      s = s.replace(/\./g, "");
    }
  }

  const num = Number(s);
  if (!Number.isFinite(num)) return null;

  // Reject values that exceed our application maximum. This also guarantees
  // the value stays within the safe-integer range, so no precision was lost
  // during the string -> number conversion above.
  if (Math.abs(num) > MAX_AMOUNT) return null;

  return num;
}

export type Currency = "XLM" | "USDC" | "EURC";

/** Maximum decimal places the backend accepts per currency.
 *  XLM amounts are stored as NUMERIC(18,7) and validated to 7dp;
 *  USDC and EURC are cent-precision assets so 2dp is correct for them.
 */
export const CURRENCY_DECIMALS: Record<Currency, number> = { XLM: 7, USDC: 2, EURC: 2 };

/** Placeholder hint for an amount input, e.g. "0.00" for USDC/EURC and
 *  "0.0000000" for XLM, so it reflects the currency's real precision (#351).
 */
export function amountPlaceholder(currency: Currency): string {
  return "0." + "0".repeat(CURRENCY_DECIMALS[currency]);
}

export const CURRENCY_SYMBOLS: Record<Currency, string> = { XLM: "", USDC: "$", EURC: "€" };
