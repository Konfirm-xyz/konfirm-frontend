/**
 * Accepts pasted real-world price text — currency symbols/whitespace,
 * US grouping ("$1,234.56") and EU grouping ("1.234,56" or "1 234,56") —
 * and returns the numeric value, or null if it still isn't a valid number.
 * A plain `Number(...)` call rejects any of this with the same generic
 * "enter an amount" error as truly empty input (#195).
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/[^0-9.,\s-]/g, "").trim();
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator appears last is the decimal point.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // Only commas: decimal comma (EU) if exactly one with 1-2 digits after
    // it, otherwise thousands separators.
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastDot > -1) {
    const parts = s.split(".");
    if (parts.length > 2) {
      // Multiple dots: thousands separators (EU style, e.g. "1.234.567").
      s = s.replace(/\./g, "");
    }
    // Single dot: already a valid decimal point, leave as-is.
  }

  s = s.replace(/\s/g, "");
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

export type Currency = "XLM" | "USDC" | "EURC";

/** Maximum decimal places the backend accepts per currency.
 *  XLM amounts are stored as NUMERIC(18,7) and validated to 7dp;
 *  USDC and EURC are cent-precision assets so 2dp is correct for them.
 */
export const CURRENCY_DECIMALS: Record<Currency, number> = { XLM: 7, USDC: 2, EURC: 2 };

export const CURRENCY_SYMBOLS: Record<Currency, string> = { XLM: "", USDC: "$", EURC: "€" };
