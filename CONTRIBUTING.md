# Contributing to konfirm-frontend

## Local setup

### Prerequisites

- Node.js 18+
- A running instance of [konfirm-backend](https://github.com/Konfirm-xyz/konfirm-backend) (local or deployed)

### Install and run

```bash
npm install
npm run dev
```

The app starts on `http://localhost:3000` by default.

### Pointing at a backend

Set `BACKEND_URL` to the base URL of the API you want to use:

```bash
# Local backend (default if unset falls back to the value in next.config.ts)
BACKEND_URL=http://localhost:4000 npm run dev

# Deployed backend
BACKEND_URL=https://api.yourdomain.com npm run dev
```

See the env-var table in README.md for all supported variables.

## Architecture boundaries

These are hard rules, not style preferences:

- **Never call a Soroban contract or Horizon directly from the frontend.** All backend calls go through the same-origin BFF proxy (`/api/backend/*`, set up in `next.config.ts`). `src/lib/api.ts` exports `API_BASE = "/api/backend"` — use it rather than constructing the backend's real URL yourself.
- **Never attest, mark-paid, or otherwise claim a payment succeeded based on frontend state alone.** Only the backend reconciler (via Horizon) is the source of truth for payment correctness — a page can show an optimistic "waiting" state, but the confirmed/paid status always comes from a backend response, not from a client-side signature or timer.

## Auth systems — there are two, keep them separate

This app has **two completely separate authentication systems** that share no cookies, no tokens, and no code paths:

| System | Entry point | Hook / utility | Session cookie |
|---|---|---|---|
| **Merchant** | `/login` | `src/lib/useAuth.ts` (`useRequireAuth` with `meEndpoint: "/auth/me"`) | `konfirm_session` |
| **Admin** | `/admin/login` | `src/lib/useAuth.ts` (`useRequireAuth` with `meEndpoint: "/admin/auth/me"`) | `konfirm_admin_session` |

A logged-in merchant is **not** logged in as an admin and vice versa. Do not assume that authenticating in one context grants access to the other. When adding a new protected page, check which auth system it belongs to and pass the correct `meEndpoint` and `loginPath` to `useRequireAuth`.

## Validation conventions

### Match backend precision — never hardcode `toFixed(2)`

The backend defines the precision rules for every field that involves numbers. When you format a value before sending it to the API, use the precision the backend actually enforces — not a hardcoded assumption:

```ts
// BAD — silently rounds or truncates any currency that needs more than 2dp
amount_usdc: amountNum.toFixed(2)

// GOOD — use a per-currency map derived from the backend schema
const CURRENCY_DECIMALS: Record<Currency, number> = { XLM: 7, USDC: 2, EURC: 2 };
amount_usdc: amountNum.toFixed(CURRENCY_DECIMALS[currency])
```

The lesson from issue #1: XLM is stored as `NUMERIC(18,7)` and validated to 7 decimal places by the backend. Hardcoding `toFixed(2)` silently overcharged merchants pricing in XLM at sub-cent precision and could produce a `"0.00"` amount that passed the form's own `> 0` guard but was meaningless to the payer.

**The rule:** if the precision of a field depends on context (currency, asset type, configuration), look at what the backend actually validates and store the mapping in a named constant near the form. Never derive precision from UI convention alone.

### Validate before formatting, not just before submitting

Run the `> 0` guard against the raw number the user typed. Do not let formatting happen first and then check — formatting can turn a valid input into an invalid one (`0.001` → `"0.00"` after `toFixed(2)`).

## Code style and design

- Lint via `npm run lint` (`eslint-config-next`, flat config in `eslint.config.mjs`). Fix lint errors rather than suppressing them.
- No CSS framework — styling is one hand-written token stylesheet. Colors, radii, and fonts come from the shared tokens in `src/app/tokens.css` (newer pages) or `globals.css` (everything else, now resolving to the same palette). Don't hardcode a hex/oklch color or a one-off radius in a component; add or reuse a token instead. See `design.md` for the full system (palette, motion, which pages have had a structural "Hallmark" pass vs. palette-only).
- Status copy shown to customers must stay free of internal terms ("session," "reconciler," "screening," etc.), and raw backend errors should go through a page's `friendlyMessage()` allowlist rather than straight to the UI.

## Running tests

```bash
npm test          # unit tests (vitest), one-shot
npm run test:watch
npm run test:e2e   # Playwright
```

There's no E2E coverage for flows that require a real wallet prompt or the anchor's interactive popup (Freighter signing, SEP-24 popup) — those are exercised by hand against a running `konfirm-backend`, not scripted.

## Before opening a pull request

- Run `npm run lint` and `npm run build` locally — `next build` includes the full TypeScript check (a standalone `tsc --noEmit` fails on a clean checkout, since App Router's generated route types don't exist until a build has run once). CI (`.github/workflows/ci.yml`) runs the same two steps plus `npm audit --audit-level=high`.
- If the change has a visible effect in the browser, verify it live (`npm run dev`) before calling it done — don't rely on lint/build/tests alone to confirm a UI fix actually works.
- Reference the issue number(s) in the PR title or body.
- Keep each PR focused on one concern if possible.
- For CSS changes that affect touch targets, note the before/after measured height.

## Reporting security issues

Don't open a public issue for a vulnerability (key handling, contract authorization, auth/session handling, payment reconciliation correctness) — use GitHub's private vulnerability reporting instead. See `SECURITY.md`.
