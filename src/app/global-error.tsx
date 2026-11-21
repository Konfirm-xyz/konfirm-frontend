'use client';

import { useEffect } from 'react';

/**
 * Root error boundary. Catches render-time crashes that escape the route-level
 * `error.tsx` (e.g. failures in the root layout). Reports the error to the
 * backend logging endpoint so the team is notified without the affected user
 * having to report it, then renders a minimal recovery UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, { boundary: 'global-error' });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '2rem',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ maxWidth: '32rem', color: '#555' }}>
            An unexpected error occurred. Our team has been notified. Please try
            again, and if the problem persists, contact support.
          </p>
          {error.digest ? (
            <p style={{ fontSize: '0.75rem', color: '#888' }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              cursor: 'pointer',
              borderRadius: '0.375rem',
              border: '1px solid #ccc',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

function reportClientError(
  error: Error & { digest?: string },
  context: Record<string, unknown>,
) {
  try {
    const payload = JSON.stringify({
      message: error?.message ?? String(error),
      stack: error?.stack ?? null,
      digest: error?.digest ?? null,
      url: typeof window !== 'undefined' ? window.location.href : null,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : null,
      timestamp: new Date().toISOString(),
      ...context,
    });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/client-errors',
        new Blob([payload], { type: 'application/json' }),
      );
      return;
    }

    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* reporting must never throw */
    });
  } catch {
    /* reporting must never throw */
  }
}
