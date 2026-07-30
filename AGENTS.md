# AI Agent Instructions

> Single source of truth for AI coding agents in this project.
> Claude Code (`CLAUDE.md`), Cursor (`.cursor/rules/core.mdc`) and Google
> Antigravity (`.agents/rules/core.md`) import this file directly via each
> tool's native `@file` syntax — edit only here, nothing else to keep in sync.
> Codex / VS Code read this file directly.

## Stack

- Runtime: Node.js 24+
- Language: TypeScript 5+ (strict mode, no exceptions)
- Framework: Hono
- ORM: Drizzle ORM (no raw SQL unless absolutely necessary)
- Database: PostgreSQL
- Validation: Zod — every input, every time
- Auth: Better Auth
- Testing: Vitest
- Cache / Queues: Redis + BullMQ
- API Docs: Scalar + OpenAPI

## Project Structure

```
src/
  routes/       # Hono route handlers
  db/           # Drizzle schema and migrations
  middleware/   # Custom middleware
  lib/          # Shared utilities
  types/        # Shared TypeScript types
```

## TypeScript Standards

- Always use strict mode
- No `any` — use `unknown` and narrow
- Explicit return types on all exported functions
- Named exports only
- One function = one responsibility
- Descriptive names: `userId` not `uid`, `getUserById` not `getUser`

## Handler Pattern

Every route handler must follow this order:
1. Validate input with Zod schema
2. Business logic
3. Typed response with correct HTTP status code

## Error Handling

- Use specific HTTP codes: 400 (bad input), 401 (unauth), 403 (forbidden), 404 (not found), 422 (validation), 500 (server error)
- Explicit error handling; do not wrap everything in blind try/catch
- Never leak internal errors to the client
- Never log passwords, tokens, or PII
- JSDoc on every exported function — describe *what* and *why*, not just *how*

## Database Rules

- Schema defined in `src/db/schema.ts`
- Migrations in `src/db/migrations/`
- Use transactions when modifying multiple tables
- Comment on intentionally skipped indexes

## Security

- Validate and sanitize all input before DB queries
- Rate limit auth and sensitive endpoints
- Never commit secrets — use environment variables validated with Zod at startup

## Testing

- Integration tests over unit tests for route handlers
- Tests live next to the code: `src/routes/users.test.ts`
- Every new endpoint must have at least one integration test in Vitest

## Before Opening a PR

- Run `npm run lint`
- Run `npm run typecheck`
- Run `npm test`

## After Opening a PR

Once CodeRabbit reviews the PR, follow CONTRIBUTING.md's PR Rules: read
every comment, fix it or reply explaining why not. Do not leave comments
unaddressed even when the underlying code gets fixed anyway — the
explanation is part of the record, and CodeRabbit uses it to improve
future reviews on this repo.

## Task Scope

- Tackle one endpoint or one module at a time
- After generating code, summarize what was done and flag any edge cases not yet handled

## Task tracking

Work is tracked as GitHub Issues on this repo, grouped into milestones per
feature area. Before starting a task, check the issue for current,
authoritative scope (`gh issue view <number>`) — descriptions may be edited
after creation as understanding changes.

- Branch naming: `{issue-number}-{slugified-issue-title}` (matches GitHub's
  own "Create a branch" button on an issue). Work not tied to a single
  numbered issue (cross-cutting docs/process cleanup) uses `{type}/{slug}`
  instead (e.g. `fix/docs-consistency-cleanup`) — same convention already
  used by past PRs like `feat/document-task-tracking-workflow`.
- PR description includes `Closes #<number>` so merging auto-closes the
  issue. This only works from the PR description itself, or from a commit
  message once that commit is merged into the default branch (the commit
  doesn't need to be made directly on the default branch, just end up
  there) — never from a PR comment, GitHub does not parse comments for
  closing keywords.
- Labels: `type:feature`, `type:testing`, `type:infra`, `type:docs` — pick
  the one matching the primary nature of the work.
- Shared or cross-cutting work needed by multiple other issues (e.g. a
  middleware several endpoints depend on) gets its own tracked issue, filed
  under the first milestone that needs it — don't build it silently inside
  whichever issue happens to need it first.
- Hard prerequisites between issues must be linked structurally, not just
  mentioned in prose: `gh issue edit <blocked> --add-blocked-by <blocker>`.
  A developer opening the blocked issue cold must see the dependency in
  GitHub's own UI, not have to infer it from a conversation they weren't
  part of.
- Status board: https://github.com/users/Danny-Lenko/projects/1 (owned by
  the maintainer's personal account, not the repo — won't appear in the
  repo's own Projects tab; `gh project item-list 1 --owner Danny-Lenko`
  works from any session)

## Commit discipline

Writing code and committing/pushing it are separate steps, each needing
its own approval. After implementing a change, stop, summarize what
changed, and wait — "implement X" is not itself approval to commit.

Bundling is fine when the change was already discussed in this
conversation and is small (e.g. applying a single review comment) — "yes,
go ahead" can cover both the fix and the commit then. For anything larger
or new, get explicit confirmation before committing.

## When you make an architectural decision

Any time you implement something involving a trade-off between viable
approaches (schema design, cascade/delete behavior, auth strategy, caching,
indexing, data types), append a new entry to docs/DECISIONS.md:

### Short title of the decision

**Рішення:** what was chosen
**Чому:** why, in 1-2 sentences
**Компроміс:** (optional) known trade-off
**Альтернатива яку відкинули:** (optional) what was considered and rejected

Append only — never rewrite or delete existing entries.

## When you complete a checkpoint or task

Check off the corresponding item in docs/PROGRESS.md. If the work isn't
listed, add it under the correct phase first. Follow-up work discovered along
the way becomes a new unchecked item, not a silent omission.

## When you add or change an API endpoint

Add or update the matching request in `api.http` (method, path, example
body) so it stays a runnable, current map of the API surface — not just a
snapshot from whenever it was created.

## When you add or change local dev workflow

If you add a new required tool, script, or way to inspect local state (a
new docker service, a new npm script, a new way to view the database),
add it to docs/ONBOARDING.md so a fresh setup covers it.

## When you introduce a backend concept for the first time

This is a learning project. Keep `docs/LEARNING.md` as a concise chronological
learning journal for backend concepts that appear in the codebase for the first
time.

Add a short entry when a task first introduces a concept such as migrations,
foreign keys, indexes, transactions, middleware, auth/session handling, Zod
validation, rate limiting, queues, caching, integration tests, OpenAPI, CI, or
deployment.

Use the format already shown in `docs/LEARNING.md`:

- **Де:** file or folder where the concept appears
- **Що це:** short plain-language explanation
- **Навіщо в цьому проєкті:** project-specific reason
- **Ключова думка:** one memorable takeaway

Append new entries at the bottom of `docs/LEARNING.md`. Keep entries brief and
do not duplicate concepts that are already explained there.
