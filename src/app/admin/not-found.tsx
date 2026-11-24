import Link from "next/link";

export default function AdminNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
        Konfirm Admin
      </p>
      <h1 className="mt-4 text-4xl font-bold text-gray-900">Page not found</h1>
      <p className="mt-3 max-w-md text-base text-gray-600">
        This admin page doesn&apos;t exist. It may have been moved, renamed, or
        removed.
      </p>
      <Link
        href="/admin"
        className="mt-8 inline-flex items-center rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Back to admin
      </Link>
    </main>
  );
}
