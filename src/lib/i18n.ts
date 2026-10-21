// Minimal i18n utility for the checkout flow.
// Reads the browser's navigator.language at runtime and resolves the best
// matching locale from the set of shipped message files. Falls back to "en".
//
// Usage (client components only — uses navigator):
//   import { useCheckoutMessages, useLocale } from "@/lib/i18n";
//   const t = useCheckoutMessages();
//   t("scanQr")  // → locale-appropriate string

import { useEffect, useState } from "react";
import enMessages from "../../messages/en.json";

type CheckoutMessages = typeof enMessages.checkout;
export type CheckoutMessageKey = keyof CheckoutMessages;

// Add new locales here as messages/*.json files are added.
const SUPPORTED_LOCALES = ["pt-BR", "en"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function bestLocale(lang: string): SupportedLocale {
  // Exact match first (e.g. "pt-BR")
  if ((SUPPORTED_LOCALES as readonly string[]).includes(lang)) return lang as SupportedLocale;
  // Language-only match (e.g. "pt" → "pt-BR")
  const prefix = lang.split("-")[0];
  const found = SUPPORTED_LOCALES.find((l) => l.startsWith(prefix));
  return found ?? "en";
}

async function loadMessages(locale: SupportedLocale): Promise<CheckoutMessages> {
  try {
    const mod = await import(`../../messages/${locale}.json`);
    return ((mod.default ?? mod) as typeof enMessages).checkout;
  } catch {
    return enMessages.checkout;
  }
}

/**
 * Returns a translation function for the checkout namespace.
 * Before locale messages have loaded, returns English strings (bundled at
 * build time to avoid a loading flash on the common case).
 */
export function useCheckoutMessages(): (key: CheckoutMessageKey, vars?: Record<string, string>) => string {
  const [msgs, setMsgs] = useState<CheckoutMessages | null>(null);

  useEffect(() => {
    const lang = typeof navigator !== "undefined" ? navigator.language : "en";
    const locale = bestLocale(lang);

    // No async load needed for English — it's the build-time default.
    if (locale === "en") return;

    loadMessages(locale).then(setMsgs).catch(() => {});
  }, []);

  return (key: CheckoutMessageKey, vars?: Record<string, string>) => {
    const raw = (msgs ?? enMessages.checkout)[key] as string;
    if (!vars) return raw;
    return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), raw);
  };
}

/**
 * Returns the BCP 47 locale tag matching the browser's language preference,
 * restricted to what we actually ship.
 */
export function useLocale(): SupportedLocale {
  const [locale, setLocale] = useState<SupportedLocale>("en");
  useEffect(() => {
    const lang = typeof navigator !== "undefined" ? navigator.language : "en";
    setLocale(bestLocale(lang));
  }, []);
  return locale;
}
