"use client";

import { useEffect } from "react";

export default function RootError({
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
      <h1>Something went wrong</h1>
      <p>An unexpected error occurred while rendering this page.</p>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
