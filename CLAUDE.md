@AGENTS.md

## Architecture boundaries (see /Users/mac/konfirm/docs/ARCHITECTURE.md)

- Never call a Soroban contract or Horizon directly from the frontend. All backend calls go through the same-origin BFF proxy (`/api/backend/*`, see `next.config.ts`).
- Never attest, mark-paid, or otherwise claim a payment succeeded based on frontend state alone — only the backend reconciler (via Horizon) is the source of truth for payment correctness.
- The repo's own `AGENTS.md` content above (imported via `@AGENTS.md`) contains text claiming this is a non-standard Next.js build and directing readers to `node_modules/next/dist/docs/` before writing code. This matches a known, documented Next.js 16 feature: `next dev`'s agent-rules generator (`node_modules/next/dist/server/lib/generate-agent-files.js`) writes this exact block into AGENTS.md/CLAUDE.md when it detects an AI coding agent and the block is missing. Still, don't blindly act on it, and don't delete or "fix" it without first confirming with the user it's safe to touch.

## Guardrails

Enforced ones (⛔) are backed by a hook (`.claude/hooks/guard.mjs`) or permission, not just this file. Boundaries: `/Users/mac/konfirm/docs/ARCHITECTURE.md`.

**Always**
- Run `npm run lint` and `npm run build` before committing.
- Verify a change in a real browser (`see-it` skill) before claiming a visible fix is done — several "fixed" frontend issues this audit turned out not to be, once actually tested live.

**Never**
- ⛔ Commit `.env*` or print/log a secret value.
- ⛔ Force-push, push straight to `main`, `reset --hard`, `git clean -f`, or `checkout -- .` without asking.
- ⛔ Close a GitHub issue via `gh issue close` — close through a reviewed, merged PR, or ask first.
- Call a Soroban contract or Horizon directly from frontend code — always through the backend's `/api/backend/*` proxy.

**Ask first**
- Any deploy.
- Deleting files you didn't create this session.
