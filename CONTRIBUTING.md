# Contributing Guide

## AI Agent Setup
**Claude Code is the only supported agent tool here.** Cursor and Antigravity
configs were removed rather than left half-alive once the situational rules
moved into `.claude/`, which only Claude Code reads — see `docs/DECISIONS.md` →
"Claude Code як єдиний підтримуваний інструмент".

- **Always-relevant rules** — `AGENTS.md` at the repo root, loaded in full on
  every request via `CLAUDE.md`. Code standards are defined there; do not
  duplicate them here.
- **Situational rules** — `.claude/skills/` (task and PR workflow, loaded on
  demand) and `.claude/hooks/` (documentation reminders that fire on the
  matching file edit). Committed on purpose: project rules, not personal setup.
  Only `.claude/settings.local.json` stays out of git.
- **Another tool** reading `AGENTS.md` directly still gets everything that
  shapes code, but not the situational workflow. Rebuild that tool's config
  from `AGENTS.md` rather than reviving the deleted ones.

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

CI runs exactly these three on every PR, so this is not a duplicate check — it
is the same check, ten minutes earlier.

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
- CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs `typecheck`,
  `lint` and `test` on every PR and on every push to `main`. Tests run against a
  fresh PostgreSQL service container, so a green run also proves the migrations
  still apply to an empty database — something a local run against a
  long-lived dev volume never checks.
- CI needs one repository secret, `BETTER_AUTH_SECRET` (any string of 32+
  characters; it signs nothing real there). Without it every run fails at
  `npm test` on env validation. GitHub does not pass secrets to pull requests
  opened from forks — that is a known limitation, see `docs/DECISIONS.md` →
  "`BETTER_AUTH_SECRET` — repository secret, не літерал у workflow".
