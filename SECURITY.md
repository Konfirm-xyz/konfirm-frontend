# Security Policy

Konfirm handles real fund custody paths — if you find a security issue, please report it privately rather than opening a public issue.

## Reporting

Use GitHub's private vulnerability reporting (Security tab → Report a vulnerability) on this repository.

## Scope

- Key handling (facilitator, deployer, fee-account) — see konfirm-backend/docs/KEYS.md
- Authorization in the Soroban contracts (compliance, payment, treasury, channel)
- Authentication and session handling (merchant and admin)
- Payment verdict / reconciliation correctness

## Response

We aim to acknowledge reports within 5 business days. This is a small, actively-developed project — response times may vary.

## Content Security Policy

The app ships a CSP header (applied app-wide via `next.config.ts` `headers()`):

```
script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self' https://horizon-testnet.stellar.org; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
```

Directive rationale (traced through source):

- `script-src 'self'` — Freighter (`@stellar/freighter-api`) communicates via `window.postMessage`, not script injection, so no special allowance is needed.
- `style-src 'self' 'unsafe-inline'` — **required**. The app has 41 React `style={{...}}` props across 21 files (e.g. `pay/page.tsx`, 14 admin files, login, signup, `fee-settlement.tsx`). React renders these as literal `style="..."` attributes with no Next.js nonce/hash, so a strict `style-src 'self'` would break layout app-wide. The QR SVG (`qrcode-generator`'s `createSvgTag()`) uses presentation attributes, not inline styles, and does not force this. Removing `'unsafe-inline'` is a separate, explicitly-scoped follow-up (migrate the 41 inline-style sites to CSS classes) — do not drop it silently.
- `img-src 'self'` — no external `<img>` hosts.
- `connect-src 'self' https://horizon-testnet.stellar.org` — Horizon testnet is hardcoded in `pay/page.tsx`, `get-test-usdc/page.tsx`, and `cashout/page.tsx`; a default `'self'` would break transaction submission. **Revisit before any mainnet deployment** (no mainnet/pubnet Horizon host exists in the codebase yet).
- `frame-ancestors 'none'` — no current feature requires framing.
- `base-uri 'self'`, `form-action 'self'` — restrict base tag and form targets.
