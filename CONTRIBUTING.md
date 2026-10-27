# Contributing to konfirm-frontend

## Local setup

### Prerequisites

- Node.js 18+
- A running instance of [konfirm-backend](https://github.com/konfirm-HQ/konfirm-backend) (local or deployed)

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

## Running tests

```bash
npm test
```

## Opening a pull request

- Reference the issue number(s) in the PR title or body.
- Keep each PR focused on one concern if possible.
- For CSS changes that affect touch targets, note the before/after measured height.
