"use client";

import { useEffect } from "react";
  useEffect(() => {
    reportClientError(error, "error-boundary");
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error occurred. Our team has been notified. You can
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
    reportClientError(error, "error-boundary");
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {isAdmin
          ? "The admin console hit an unexpected error. You can retry, or sign in again to recover."
          : "An unexpected error occurred. Our team has been notified. You can try again, or come back later."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
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
