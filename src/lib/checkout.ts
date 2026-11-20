/**
 * Pure helpers for the payer-facing checkout flow (`/pay/[linkId]`), split
 * out of the client component so they're unit-testable without mounting
 * React or stubbing Freighter/fetch.
 */

// Every status line here is written for the person paying, not for whoever's
// debugging this later — no "session," "reconciler," or "screening" ever
// reaches this screen. Technical detail still goes to the console.
export function friendlyMessage(err: unknown): string {
  const msg = String((err as Error)?.message || err || "");
  const knownSafe = [
    "link is not active",
    "link has expired",
    "link not found",
    "this address is not permitted to pay",
    "pay-what-you-want links need an amount",
  ];
  if (knownSafe.some((s) => msg.toLowerCase().includes(s))) return msg;
  if (msg.toLowerCase().includes("declined") || msg.toLowerCase().includes("rejected")) {
    return "You'll need to approve the payment in your wallet to continue.";
  }
  if (msg.toLowerCase().includes("freighter") || msg.toLowerCase().includes("wallet")) {
    return "We couldn't connect to your wallet. Make sure Freighter is installed and unlocked, then try again.";
  }
  return "Something didn't go through on our end. Please try again.";
}

export function randomMuxedId(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  // Keep it within the positive int64 range Soroban/Stellar expect.
  const high = BigInt(buf[0] & 0x7fffffff);
  const low = BigInt(buf[1]);
  return ((high << 32n) | low).toString();
}
