"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Warns the user before they close the tab or navigate away while a
 * wallet-signing/submission operation is in flight. Takes a ref (not React
 * state) because the warning needs to reflect the very latest in-flight
 * status synchronously, without waiting for a re-render.
 */
export function useBeforeUnload(inFlight: RefObject<boolean>): void {
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (!inFlight.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [inFlight]);
}
