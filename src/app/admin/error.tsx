"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="empty" role="alert">
      <h1>Admin error</h1>
      <p>Something went wrong loading this admin page.</p>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
      <p>
        <Link href="/admin">Back to Overview</Link>
      </p>
    </div>
  );
}
