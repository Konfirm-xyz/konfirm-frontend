'use client';

import Link from 'next/link';
import { useEffect } from 'react';

// NOTE: This boundary wraps admin/*/page.tsx and nested segments, but NOT
// admin/layout.tsx itself. A synchronous throw inside the admin layout's
// render body bypasses this file and is caught by the root src/app/error.tsx,
// which is path-aware and links back to /admin/login for /admin crashes.
// Keep admin/layout.tsx's render body trivial/guarded so this remains the
// documented behavior.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Admin error</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Something went wrong while loading this admin page. You can retry or
        return to the admin dashboard.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Back to admin
        </Link>
      </div>
    </div>
  );
}
