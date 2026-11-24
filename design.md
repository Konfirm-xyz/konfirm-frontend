# Design: Konfirm

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System
- Genre: modern-minimal
- Shape of the first page (`/`): Map/Diagram
- Theme: Dusk (vibe: "dark, cool, committed -- glass panels over a converging-lines diagram")
- Axes: dark/grotesk-sans/cool · posture: committed

## Brand

Konfirm previously used a two-accent system (blue for merchant payments, purple for agent/x402 payments). Dusk's material allows one accent only. By explicit decision (confirmed with the user, first for `/` and later extended app-wide), the merchant-vs-agent distinction is carried by copy, iconography and section placement, never by color. Do not reintroduce a second signal color on any page.

## Tokens
`src/app/tokens.css` is the source of truth, shared by every route. The roles:
```css
:root {
  color-scheme: dark;
  --color-paper: oklch(17.5% 0.014 268); --color-paper-2: oklch(21% 0.016 268); --color-paper-3: oklch(25% 0.017 268);
  --color-ink: oklch(96% 0.006 75); --color-ink-2: oklch(85% 0.010 262); --color-muted: oklch(70% 0.016 262);
  --color-rule: oklch(30% 0.016 266); --color-light: oklch(100% 0 0); --color-shade: oklch(10% 0.022 268);
  --color-accent: oklch(77% 0.10 274); --color-accent-ink: oklch(19% 0.035 274); --color-accent-hi: oklch(84% 0.085 274);
  --color-accent-deep: oklch(44% 0.13 274); --color-accent-soft: oklch(91% 0.038 274); --color-focus: oklch(80% 0.10 274);
  --color-accent-2: oklch(83% 0.095 62); --color-dusk: oklch(70% 0.12 330);
  --color-accent-on-light: oklch(52% 0.18 274); /* same periwinkle hue, re-tuned for light surfaces */
  --color-well: oklch(95.5% 0.008 75); --color-well-2: oklch(92% 0.010 75); --color-well-ink: oklch(21% 0.016 268); --color-well-muted: oklch(47% 0.016 265); --color-well-rule: oklch(87.5% 0.009 75); --color-card: oklch(99.5% 0.003 75);
  --glass: oklch(22% 0.018 268 / 0.58); --glass-blur: 22px;
  --font-display: "Wix Madefor Display", ui-sans-serif, system-ui, sans-serif; --font-body: "Wix Madefor Text", ui-sans-serif, system-ui, sans-serif;
  --radius-card: 18px; --radius-inner: 10px; --radius-pill: 999px; --rule-hair: 1px;
}
```
`src/app/base.css` holds the Floor rules (overflow-x: clip, focus rings, heading rules, slot CSS), scoped to `.landing` until every route has had its own Hallmark pass (see that file's own migration note).

The other 33 routes keep a separate, older token layer (`--ink`, `--surface`, `--surface-2`, `--border`, `--text-hi`, `--text-lo`, `--text-faint`, `--accent`, `--accent-ink`, `--signal`, `--signal-ink`, in `globals.css`) feeding their existing components (`.card`, `.field`, `.btn-primary`, admin tables, etc.). As of the app-wide Dusk reskin, every one of those tokens now resolves to a Dusk value -- `--color-well`/`--color-card`/`--color-accent-on-light` family in light mode, `--color-paper`/`--color-accent` family in dark mode -- so the whole app shares one palette through the existing `ThemeToggle` (`ThemeToggle` itself, its light/dark split, and `--success`/`--error`/`--warn` were left alone: status colors are functional, not brand). Only `/` has had a structural pass (shape, hero, copy, sections); the other routes are palette-only until their own Hallmark pass.

## Controls
- Primary: pill button (`--radius-pill`), periwinkle accent, white/dark ink depending on mode
- Dusk surfaces: glass panels (`--glass`, `--glass-blur`) over photography/diagrams on `/`; plain `--color-paper-2`/`--color-well`-family cards elsewhere
- Never a second signal color, never a drop shadow pretending to be a glow

## Pages: scope and treatment
- **Public/checkout pages** (full Hallmark treatment -- shape, hero, sections): `/` (done). `/signup`, `/login`, `/docs`, `/get-test-usdc`, `/forgot-password`, `/reset-password`, `/pay/[linkId]` still use their original layout, now in Dusk's palette.
- **App screens** (theme lends palette/faces/surfaces only -- no hero, no shape, dense/earned-familiarity rules per Hallmark's `flow.md` § App screens): `/activity`, `/cashout`, `/links`, `/new`, `/referrals`, and all 21 routes under `/admin/*`.
- Every other page besides `/` reads this file and takes the palette; shape/hero/nav/footer are only decided once a page gets its own structural pass.

## Motion
- Character: calm. `/`'s hero has a flowing two-band ribbon (Stripe's hero motion technique, rebuilt in Dusk's own periwinkle/apricot/dusk hues, never Stripe's colors or its stat strip) plus a staggered map reveal. Elsewhere: no motion beyond the shared focus/hover states. Under reduced motion everything ends at once.

## Exports
`src/app/tokens.css` in this project. Tailwind, DTCG or shadcn blocks are added here on request, per `export-formats.md`.
