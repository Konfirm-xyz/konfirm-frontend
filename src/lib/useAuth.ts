"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "./api";

export interface UseRequireAuthOptions<T> {
  /** e.g. "/admin/auth/me" or "/auth/me" */
  meEndpoint: string;
  /** e.g. "/admin/login" or "/login" */
  loginPath: string;
  /** Skip the check entirely — e.g. the login page itself. */
  skip?: boolean;
  /** Pull the caller's shape out of the /me response body, e.g.
   * `(body) => body.admin` or `(body) => body.merchant`. Defaults to the
   * raw body. */
  select?: (body: unknown) => T;
}

/** Distinguishes why the auth check failed so callers/telemetry can tell a
 * real session expiry apart from a backend outage or a client-side network
 * error (#86). */
export type AuthFailureKind = "session_expired" | "server_error" | "network_error";

export interface UseRequireAuthResult<T> {
  /** True once the check has resolved successfully (or was skipped) — the
   * same "don't render the real page yet" gate every duplicated
   * implementation had under a different local variable name. */
  resolved: boolean;
  data: T | null;
  /** Set when the check failed for a non-auth reason (5xx or network). A
   * real 401 still redirects to login and leaves this null. */
  error: AuthFailureKind | null;
}

// Consolidates the identical auth-check block that was independently
// hand-rolled in four places (admin/layout.tsx, new/page.tsx,
// activity/page.tsx, cashout/page.tsx): fetch a `/*/auth/me`-style
// endpoint with credentials, redirect to a login page on failure, and hold
// off rendering the real page until it resolves. This only covers that one
// shared shape — pages with extra derived state (activity/page.tsx's
// showNav, cashout/page.tsx's stellar-address check) still compute that
// themselves from `data`, same as before.
export function useRequireAuth<T = unknown>(options: UseRequireAuthOptions<T>): UseRequireAuthResult<T> {
  const router = useRouter();
  const { meEndpoint, loginPath, skip, select } = options;
  const [resolved, setResolved] = useState(Boolean(skip));
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<AuthFailureKind | null>(null);
  const prevSkipRef = useRef(Boolean(skip));

  useEffect(() => {
    // Reset resolved when skip transitions from true to false so the auth
    // gate blocks rendering until the re-check actually completes (#124).
    if (prevSkipRef.current && !skip) {
      setResolved(false);
      setData(null);
      setError(null);
    }
    prevSkipRef.current = Boolean(skip);
    if (skip) return;
    let cancelled = false;

    function check() {
      (async () => {
        try {
          const res = await fetch(`${API_BASE}${meEndpoint}`, { credentials: "include" });
          if (cancelled) return;
          if (!res.ok) {
            // A real 401 means the session is gone — bounce to login with a
            // reason so the login page can explain why. Any other non-OK
            // status (5xx, etc.) is a backend problem, not an auth failure:
            // surface a distinct error state instead of silently redirecting
            // every logged-in user to login (#86).
            if (res.status === 401) {
              console.error("[auth] session_expired", { endpoint: meEndpoint, status: res.status });
              router.push(`${loginPath}?reason=session_expired`);
              return;
            }
            console.error("[auth] server_error", { endpoint: meEndpoint, status: res.status });
            setError("server_error");
            setResolved(true);
            return;
          }
          // Guard against a 200 with an empty/non-JSON body: an unguarded
          // res.json() would throw and leave `resolved` false forever.
          const body = await res.json().catch(() => null);
          if (cancelled) return;
          if (body === null) {
            console.error("[auth] server_error", { endpoint: meEndpoint, status: res.status, reason: "empty_body" });
            setError("server_error");
            setResolved(true);
            return;
          }
          setData(select ? select(body) : (body as T));
          setResolved(true);
        } catch (err) {
          // A thrown fetch is a true network/offline error (or select()
          // throwing) — distinct from an HTTP 401/5xx. Don't redirect; expose
          // a network error state so the user isn't bounced to login (#86).
          if (cancelled) return;
          console.error("[auth] network_error", { endpoint: meEndpoint, error: err });
          setError("network_error");
          setResolved(true);
        }
      })();
    }

    check();

    // When a page is restored from the back/forward cache (bfcache), the
    // component tree is reused as-is and this effect does NOT re-run, so a
    // stale session could otherwise keep rendering a previously-authed
    // admin page without re-checking auth. `pageshow` fires on every
    // navigation, including bfcache restores, and `event.persisted` is
    // true only for the latter — re-run the auth check in that case.
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        setResolved(false);
        setError(null);
        check();
      }
    }
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, meEndpoint, loginPath]);

  return { resolved, data, error };
}

// Single shared timestamp formatter for admin pages. The backend stores
// timestamps in UTC, so every admin-visible timestamp is pinned to UTC
// explicitly (rather than implicitly using the viewer's browser-local zone)
// and labelled with a visible "UTC" suffix so it's unambiguous without
// relying on the viewer's own clock. Returns "—" for missing values.
export function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleString(undefined, { timeZone: "UTC" })} UTC`;
}
