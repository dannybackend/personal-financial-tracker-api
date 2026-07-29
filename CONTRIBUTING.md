# Contributing Guide

## AI Agent Setup
- **Single source of truth** — all agent rules live in `AGENTS.md` at the repo root. Edit only there; every tool below imports it directly, nothing to hand-sync.
- **VS Code + Codex** — reads `AGENTS.md` directly
- **Claude Code** — `CLAUDE.md` in repo root, imports `AGENTS.md` in full
- **Cursor** — `.cursor/rules/core.mdc` (always-on), imports `AGENTS.md` in full; minimal `.cursorrules` pointer in repo root for discoverability
- **Google Antigravity** — `.agents/rules/core.md` (always-on), imports `AGENTS.md` in full
- **Code standards** — defined in `AGENTS.md`; do not duplicate here

## Local Setup
```bash
# 1. Clone and install
git clone <repo>
cd <repo>
npm install

# 2. Start PostgreSQL + Redis
docker compose up -d

# 3. Copy env and fill in values
cp .env.example .env

# 4. Run migrations
npm run db:migrate

# 5. Start dev server
npm run dev
```

## Git Workflow
- `main` — protected, production-ready only
- Branch naming: `{issue-number}-{slugified-issue-title}` (GitHub's own
  "Create a branch" button on an issue generates this automatically)

One feature = one PR. Even if you are working alone.

## PR Rules
- Every PR goes through CodeRabbit review
- Read every CodeRabbit comment — either fix it or leave a comment explaining why you disagree
- Do not dismiss comments silently
- A feature and its integration-test issue ship in the same PR (e.g. #11 and #12) — a feature PR shouldn't merge before its test coverage lands, per `AGENTS.md`'s "every new endpoint needs a test" rule

## Before Every Commit
```bash
npm run lint
npm run typecheck
npm test
```

## Working With AI Agents

**Understand before moving on.**
If an agent wrote 30+ lines and you cannot explain what each block does and why — stop. Ask it to explain, then close and rewrite it yourself.

## Architecture Decisions
Significant decisions (schema design, auth approach, caching strategy) must be documented in a short comment at the top of the relevant file or in `/docs` before implementation begins.

## Environment Variables
- Never commit `.env`
- Always update `.env.example` when adding a new variable
- Validate all env vars with Zod at startup (see `AGENTS.md`)

## Testing
- Integration tests over unit tests for route handlers
- Tests live next to the code: `src/routes/users.test.ts`
- CI (GitHub Actions) running tests on every PR is planned, not wired up yet — see issue #22. Until then, run `npm run lint`, `npm run typecheck`, and `npm test` locally before every PR (see "Before Every Commit" above).
