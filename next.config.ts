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

// Full Content-Security-Policy applied to every route. Directive-by-directive
// rationale (see issue #78):
//   - script-src 'self' 'unsafe-inline' (see below): Freighter (@stellar/freighter-api) talks over
//     window.postMessage, not script injection, so no extra allowance needed.
//   - style-src 'self' 'unsafe-inline': REQUIRED. React renders `style={{...}}`
//     props as literal inline `style="..."` attributes with no Next.js
//     nonce/hash. There are 41 such sites across 21 files (e.g.
//     pay/page.tsx, 14 admin files, login, signup, fee-settlement.tsx).
//     Dropping 'unsafe-inline' without first migrating those sites to CSS
//     classes would silently break layout app-wide. That migration is a
//     separate, explicitly-scoped follow-up — do NOT remove it here.
//   - img-src 'self': no external <img> hosts; the QR SVG uses presentation
//     attributes (fill="white"), not inline style, so 'self' suffices.
//   - connect-src 'self' https://horizon-testnet.stellar.org: Horizon testnet
//     is hardcoded in pay/page.tsx, get-test-usdc/page.tsx and cashout/page.tsx;
//     a bare 'self' would break transaction submission. Revisit before any
//     mainnet deployment (no mainnet/pubnet Horizon host exists yet).
//   - frame-ancestors 'none': no current feature needs framing.
const contentSecurityPolicy = [
  // 'unsafe-inline' needed: Next 14 app router hydrates via inline <script> tags and no nonce is wired up yet.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "connect-src 'self' https://horizon-testnet.stellar.org",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Baseline security response headers applied to every route. Framing is
// locked down (CSP frame-ancestors + X-Frame-Options fallback) so the admin
// dashboard can't be clickjacked; nosniff and a strict referrer policy round
// out the safe, non-breaking set.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
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
  // Don't advertise the framework via `X-Powered-By: Next.js` on every
  // response — a free fingerprinting signal for attackers.
  poweredByHeader: false,
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