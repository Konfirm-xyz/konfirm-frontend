"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Centralized route-change handler: on every client-side navigation it
// moves focus to the new page's main landmark/heading and writes the new
// page's title into a visually-hidden aria-live region, mirroring the
// "route announcer" pattern browsers give for free on a full page load but
// Next.js client-side transitions never provide on their own.
export default function RouteAnnouncer() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState("");
  // Tracks the last pathname this effect actually handled, not just "have we
  // rendered before" — a plain boolean flag gets flipped by React's dev-only
  // Strict Mode double-invoke (mount → cleanup → mount again, same render),
  // which defeated a `useRef(true)`-style guard: its first invocation
  // flipped the flag to false with no cleanup to undo it, so the immediate
  // second invocation ran the real focus/announce logic on first load too —
  // moving focus to the page's own <h1> as soon as it rendered (visible as
  // an unexpected keyboard-focus ring around the heading on every page,
  // caught while screenshotting the redesign). Comparing against the actual
  // previous pathname is idempotent across the duplicate call.
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    // Skip the initial mount and any duplicate invocation for the same
    // pathname: the browser's own load already handled focus and any
    // assistive-tech announcement for the first page.
    if (previousPathname.current === null || previousPathname.current === pathname) {
      previousPathname.current = pathname;
      return;
    }
    previousPathname.current = pathname;

    const heading = document.querySelector("h1");
    const title = (heading?.textContent || document.title || "Page").trim();
    setAnnouncement(`Navigated to ${title}`);

    const focusTarget = (heading as HTMLElement | null) ?? document.querySelector("main");
    if (focusTarget) {
      if (!focusTarget.hasAttribute("tabindex")) {
        focusTarget.setAttribute("tabindex", "-1");
      }
      (focusTarget as HTMLElement).focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
      }}
    >
      {announcement}
    </div>
  );
}
