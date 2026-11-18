import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-center">
      <div className="card narrow">
        <div className="brand" style={{ marginBottom: 24 }}>
          <span className="mark">✓</span> Konfirm
        </div>
        <h1 style={{ marginBottom: 12 }}>Page not found</h1>
        <p style={{ marginBottom: 22 }}>
          We couldn&apos;t find the page you were looking for. It may have moved or the link may be
          out of date.
        </p>
        <Link href="/login" className="primary" style={{ display: "inline-block", textAlign: "center" }}>
          Back to login
        </Link>
      </div>
    </div>
  );
}
