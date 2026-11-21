import type { NextConfig } from "next";

// Backend-for-frontend: the browser only ever talks to this Next.js origin.
// Everything under /api/backend/* is transparently proxied to the real
// NestJS API, server-to-server, with the full request (including the
// session cookie) forwarded and the full response (including any
// Set-Cookie) relayed back untouched. This keeps auth same-origin from the
// browser's point of view — no CORS, no SameSite=None, no HTTPS-in-dev
// requirement — which is the whole reason this pattern was chosen over
// direct cross-origin calls from the client to NestJS.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4001";

// Full Content-Security-Policy applied to every route. Directive-by-directive
// rationale (see issue #78):
//   - script-src 'self': Freighter (@stellar/freighter-api) talks over
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
  "script-src 'self'",
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