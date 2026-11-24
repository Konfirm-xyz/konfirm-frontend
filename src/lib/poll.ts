// Shared helpers for the activity page's polling loop.

/**
 * Whether a run of consecutive poll failures has crossed the threshold where
 * we should stop claiming to be "live" and warn the merchant.
 *
 * This is only meaningful for *transient* failures (network errors, 5xx).
 * Terminal failures such as an expired session (401) must be handled by the
 * caller before incrementing the shared counter — see
 * `isTerminalAuthFailure` below.
 */
export function shouldShowPollError(consecutiveFailures: number, threshold: number): boolean {
  return consecutiveFailures >= threshold;
}

/**
 * Whether an HTTP status represents a terminal auth failure that retrying
 * will never fix. A 401 means the session is gone; the caller should redirect
 * to login (the same pattern useRequireAuth uses) rather than feeding it into
 * the transient-failure counter and showing a generic "poll error" banner.
 */
export function isTerminalAuthFailure(status: number): boolean {
  return status === 401;
}
