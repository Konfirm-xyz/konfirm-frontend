"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  // A throw inside `admin/layout.tsx`'s render body bypasses `admin/error.tsx`
  // (error boundaries do not wrap the layout above them in the same segment)
  // and surfaces here instead. Keep the fallback path-aware so admin users
  // still get admin-appropriate recovery destinations.
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="error-shell">
      <h1>Something went wrong</h1>
      <p>
        {isAdmin
          ? "The admin console hit an unexpected error. You can retry, or sign in again to recover."
          : "An unexpected error occurred. You can retry, or head back to sign in."}
      </p>
      <div className="error-actions">
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
        {isAdmin ? (
          <>
            <Link href="/admin">Back to admin</Link>
            <Link href="/admin/login">Admin sign in</Link>
          </>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </div>
    </div>
  );
}
