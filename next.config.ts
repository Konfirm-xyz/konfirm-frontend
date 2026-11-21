import type { NextConfig } from "next";

// Backend-for-frontend: the browser only ever talks to this Next.js origin.
// Everything under /api/backend/* is transparently proxied to the real
// NestJS API, server-to-server, with the full request (including the
// session cookie) forwarded and the full response (including any
// Set-Cookie) relayed back. This keeps auth same-origin from the browser's
// point of view — no CORS, no SameSite=None, no HTTPS-in-dev requirement —
// which is the whole reason this pattern was chosen over direct cross-origin
// calls from the client to NestJS.
//
// IMPORTANT — cookie fidelity is mechanism-specific, not a Next.js contract:
// the "Set-Cookie survives untouched" property above holds because external
// URL rewrites are currently served by Next's internal `httpxy` proxy, which
// copies Node's raw multi-value headers object verbatim (preserving the
// native Set-Cookie array, including multiple cookies and comma-containing
// attributes like `Expires`). This is an undocumented internal implementation
// detail, NOT a stated Next.js guarantee. Next's officially-documented
// alternative for the same job — a Route Handler doing `fetch()`-based
// proxying — does NOT preserve this by default: Fetch's `Headers` abstraction
// can coalesce multiple Set-Cookie headers into one comma-joined, corrupted
// string, which is why Next's own internals need an explicit
// `splitCookiesString()` workaround there (see vercel/next.js#70127).
//
// If this proxy is ever "modernized" to a Route Handler / `fetch()` pattern
// (or `proxy.ts`), do NOT drop the cookie-fidelity property silently: re-add
// equivalent handling (e.g. `splitCookiesString()` on the upstream response)
// and cover it with a regression test that has the backend set two cookies
// (or one with a comma in `Expires`) in a single response and asserts both
// survive the proxy with all attributes intact.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4001";

// Baseline security response headers applied to every route. Framing is
// locked down (CSP frame-ancestors + X-Frame-Options fallback) so the admin
// dashboard can't be clickjacked; nosniff and a strict referrer policy round
// out the safe, non-breaking set. A full CSP is intentionally out of scope.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
      {
        source: "/pay/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;