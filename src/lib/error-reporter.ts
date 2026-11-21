/**
 * Lightweight client-side error reporter.
 *
 * There is no third-party error-tracking SDK wired up for this deployment
 * (see src/app/admin/notifications/page.tsx). To make uncaught client
 * exceptions visible to the team without requiring the affected user to
 * report them, we POST a compact payload to a backend logging endpoint.
 *
 * The endpoint is configured via NEXT_PUBLIC_ERROR_REPORT_ENDPOINT. When it
 * is unset (e.g. local dev) reporting is a no-op so we never spam the console
 * or make surprise network calls.
 */

type ErrorReport = {
  message: string;
  stack?: string;
  source: "error-boundary" | "global-error-boundary" | "window.onerror" | "unhandledrejection";
  url?: string;
  userAgent?: string;
  timestamp: string;
};

const ENDPOINT = process.env.NEXT_PUBLIC_ERROR_REPORT_ENDPOINT;

function serializeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

/**
 * Report a client-side error to the backend logging endpoint.
 * Never throws — reporting failures must not mask the original error.
 */
export function reportError(
  error: unknown,
  source: ErrorReport["source"],
): void {
  if (!ENDPOINT) {
    return;
  }

  const { message, stack } = serializeError(error);
  const payload: ErrorReport = {
    message,
    stack,
    source,
    url: typeof window !== "undefined" ? window.location.href : undefined,
    userAgent:
      typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    timestamp: new Date().toISOString(),
  };

  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* swallow — reporting must never throw */
    });
  } catch {
    /* swallow — reporting must never throw */
  }
}

/**
 * Install global listeners for errors that React error boundaries cannot
 * catch: non-React exceptions (window.onerror) and unawaited promise
 * rejections (unhandledrejection). Safe to call multiple times; returns a
 * cleanup function that removes the listeners.
 */
export function installGlobalErrorHandlers(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onError = (event: ErrorEvent) => {
    reportError(event.error ?? event.message, "window.onerror");
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportError(event.reason, "unhandledrejection");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
