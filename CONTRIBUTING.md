# Contributing Guide

## AI Agent Setup
**Claude Code is the only supported agent tool here.** Cursor and Antigravity
configs were removed rather than left half-alive once the situational rules
moved into `.claude/`, which only Claude Code reads — see `docs/DECISIONS.md` →
"Claude Code як єдиний підтримуваний інструмент".

- **Always-relevant rules** — `AGENTS.md` at the repo root, loaded in full on
  every request via `CLAUDE.md`. Code standards are defined there; do not
  duplicate them here.
- **Situational rules** — `.claude/skills/` (task workflow, PR workflow, and
  the review flow `/code-review` → triage → apply; loaded on demand) and
  `.claude/hooks/` (documentation reminders that fire on the matching file
  edit). Committed on purpose: project rules, not personal setup.
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
- Read every CodeRabbit comment and act on each one. Whether it also needs a written reply is decided by the rule in `.claude/skills/pr-workflow/SKILL.md` → "After CodeRabbit reviews", deliberately not restated here — the copy that used to live on this line named only one of the cases that rule lists
- Do not dismiss comments silently. This line is the rule's home; `pr-workflow` points back here for it
- A feature and its integration-test issue ship in the same PR (e.g. #11 and #12) — a feature PR shouldn't merge before its test coverage lands, per `AGENTS.md`'s "every new endpoint needs a test" rule

## Before Every Commit
```bash
npm run lint
npm run typecheck
npm test
```

CI runs these three on every PR, so this is not a duplicate check — it is the
same check, ten minutes earlier. Two further jobs run beside them (see Testing
below), and [`.github/pull_request_template.md`](.github/pull_request_template.md)
requires them before a PR is opened: `npm run check:config-paths` and
`npm run check:toc`, which need nothing, and `npm run check:markers`, which
needs a GitHub token (`docs/ONBOARDING.md` → "Корисні команди").

## Working With AI Agents

**Understand before moving on.**
If an agent wrote 30+ lines and you cannot explain what each block does and why — stop. Ask it to explain, then close and rewrite it yourself.

## Architecture Decisions
Significant decisions (schema design, auth approach, caching strategy) go in
`docs/DECISIONS.md`, written per the format in that file's own header, before
implementation begins. That header is the only statement of the entry format and
of how a correction is recorded; `AGENTS.md` and the pull request template point
there rather than restating it, and so does this line.

## Environment Variables
- Never commit `.env`
- Always update `.env.example` when adding a new variable
- Validate all env vars with Zod at startup (see `AGENTS.md`)

## Testing
- Integration tests over unit tests for route handlers
- Tests live next to the code: `src/routes/users.test.ts`
- CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs **three
  jobs** on every PR and on every push to `main`.
  - `ci` runs `typecheck`, `lint` and `test`. Tests run against a fresh
    PostgreSQL service container, so a green run also proves the migrations
    still apply to an empty database — something a local run against a
    long-lived dev volume never checks.
  - `markers` runs `check:markers`. `config-paths` runs `check:config-paths`
    and `check:toc`. Each command needs no database and no `npm ci`, so a
    docs-only PR gets its answer in seconds instead of waiting on Postgres and
    the suite. `markers` is skipped on forks — a fork does not inherit this
    repository's issue list, so every marker would resolve to "does not
    exist"; `config-paths` reads no issues and runs there too.
  - **This list is checked.** `config-paths` reads this file and fails when a
    job or a `check:*` script named here and in `ci.yml` disagree, in either
    direction. It used to say nothing checked it, and it was short by one from
    the day `markers` landed and by two after `config-paths`.
- CI needs no repository secret. `BETTER_AUTH_SECRET` is a literal in the
  workflow (32+ characters, signing nothing real), because a `secrets.*`
  reference comes back empty in every run GitHub withholds secrets from — pull
  requests from forks, and pull requests opened by Dependabot. Those runs then
  fail on the secret's *length*, an error that never mentions the missing
  delivery. See `docs/DECISIONS.md` → "Уточнення: `BETTER_AUTH_SECRET` у CI —
  таки літерал". Do not "restore" it to a secret without reading that entry:
  it reverses an acceptance criterion of issue #22 on purpose.
