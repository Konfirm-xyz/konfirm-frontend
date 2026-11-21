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

  useEffect(() => {
    if (skip) return;
    let cancelled = false;

    apiGet(meEndpoint)
      .then((body) => {
        if (cancelled) return;
        setData(select ? select(body) : (body as T));
        setResolved(true);
      })
      .catch(() => {
        if (cancelled) return;
        router.replace(loginPath);
      });

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

  return { resolved, data };
}
