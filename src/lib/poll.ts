/**
 * Decides whether a run of consecutive failed polls is enough to tell the
 * merchant something's wrong, vs. a single blip that shouldn't flash a
 * scary banner.
 */
export function shouldShowPollError(consecutiveFailures: number, threshold: number): boolean {
  return consecutiveFailures >= threshold;
}
