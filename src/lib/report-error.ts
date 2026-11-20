// Every call site already wraps this in a catch block before setting its
// own UI error state -- this never throws and never blocks the caller.
// Sentry is not actually configured on the frontend yet (see
// docs/ARCHITECTURE.md's External services table) -- this logs to the
// console instead, in the shape real Sentry wiring would want
// (Sentry.captureException(error, context)), so swapping it in later is a
// one-line change, not a rewrite of every call site.
//
// Two call shapes exist across the codebase: (error, context) -- the
// Sentry-style majority -- and (label, error), an earlier, different
// convention (admin-login, login, signup). Both are accepted rather than
// picking one and breaking the other half.
export function reportError(a: unknown, b?: unknown): void {
  if (typeof a === "string" && b !== undefined) {
    console.error(`[konfirm] ${a}:`, b);
    return;
  }
  console.error("[konfirm]", a, b ?? "");
}
