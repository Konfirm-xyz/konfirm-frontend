"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";

const AUTH_CHANNEL = "konfirm-auth";
const LOGOUT_STORAGE_KEY = "konfirm-auth-logout";

type AuthSignal = "logout";

function broadcastLogout() {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.postMessage("logout" satisfies AuthSignal);
      channel.close();
    }
  } catch {
    // BroadcastChannel unavailable — fall through to storage event.
  }
  try {
    localStorage.setItem(LOGOUT_STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable — nothing else we can do.
  }
}

/**
 * Notify every other open tab that the session has ended so they can
 * redirect to login without waiting for their own API call to fail.
 */
export function notifyLogout() {
  broadcastLogout();
}

interface UseRequireAuthOptions<T> {
  meEndpoint: string;
  loginPath: string;
  skip?: boolean;
  select?: (body: unknown) => T;
}

interface UseRequireAuthResult<T> {
  resolved: boolean;
  data: T | null;
  /** Set when the check failed for a non-auth reason (5xx or network). A
   * real 401 still redirects to login and leaves this null. */
  error: AuthFailureKind | null;
  /** Re-run the auth check (e.g. after a 5xx/network failure). No-op while skipped. */
  retry: () => void;
}

export function useRequireAuth<T = unknown>({
  meEndpoint,
  loginPath,
  skip = false,
  select,
}: UseRequireAuthOptions<T>): UseRequireAuthResult<T> {
  const router = useRouter();
  const [resolved, setResolved] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<AuthFailureKind | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const prevSkipRef = useRef(Boolean(skip));

  // Callers pass `selec
  retry: () => void;
}

export function useRequireAuth<T = unknown>({
  meEndpoint,
  loginPath,
  skip = false,
  select,
}: UseRequireAuthOptions<T>): UseRequireAuthResult<T> {
  const router = useRouter();
  const [resolved, setResolved] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const prevSkipRef = useRef(Boolean(skip));
  // Callers pass `select` as a fresh inline arrow on every render, so it is
  // intentionally excluded from the effect's dependency array (re-running the
  // auth check on every render would be wasteful). Reading it through a ref
  // updated each render means the effect always invokes the latest `select`
  // rather than the one captured when skip/meEndpoint/loginPath last changed
  // — no stale-closure risk if a caller's extraction logic legitimately
  // changes between renders (#361).
  const selectRef = useRef(select);
  selectRef.current = select;

  useEffect(() => {
    if (skip) return;
    let cancelled = false;

    function check() {
      (async () => {
        try {
          const res = await fetch(`${API_BASE}${meEndpoint}`, { credentials: "include" });
          if (cancelled) return;
          if (!res.ok) {
            router.push(loginPath);
            return;
          }
          // Guard against a 200 with an empty/non-JSON body: an unguarded
          // res.json() would throw and leave `resolved` false forever.
          const body = await res.json().catch(() => null);
          if (cancelled) return;
          if (body === null) {
            router.push(loginPath);
            return;
          }
          setData(select ? select(body) : (body as T));
          setError(false);
          setResolved(true);
        } catch {
          // Any other unexpected failure (network error, select() throwing)
          // must still reach a terminal state rather than hanging the gate.
          // Surface a retryable error instead of redirecting, since the
          // backend may simply be unreachable rather than the session being
          // invalid.
          if (cancelled) return;
          setError(true);
          setResolved(false);
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
        check();
      }
    }
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, meEndpoint, loginPath, retryToken]);

  function retry() {
    if (skip) return;
    setError(false);
    setResolved(false);
    setRetryToken((n) => n + 1);
  }

  return { resolved, data, error, retry };
}

    return () => {
      cancelled = true;
    };
  }, [meEndpoint, loginPath, skip, select, router]);

  // Cross-tab logout sync: redirect this tab to login as soon as any other
  // tab for the same session logs out.
  useEffect(() => {
    if (skip) return;

    function handleLogoutSignal() {
      router.replace(loginPath);
    }

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(AUTH_CHANNEL);
        channel.onmessage = (event: MessageEvent) => {
          if (event.data === "logout") handleLogoutSignal();
        };
      }
    } catch {
      channel = null;
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === LOGO

    function handleLogoutSignal() {
      router.replace(loginPath);
    }

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(AUTH_CHANNEL);
        channel.onmessage = (event: MessageEvent) => {
          if (event.data === "logout") handleLogoutSignal();
        };
      }
    } catch {
      channel = null;
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === LOGOUT_STORAGE_KEY && event.newValue) {
        handleLogoutSignal();
      }
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, [loginPath, skip, router]);

  return { resolved, data, error, retry };
}
