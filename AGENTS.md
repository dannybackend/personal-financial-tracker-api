# AI Agent Instructions

> Rules for AI coding agents. **This project is developed with Claude Code**,
> which loads this file via `CLAUDE.md` plus `.claude/skills/` and
> `.claude/hooks/`.
>
> **This file holds only what shapes code as it is written**, because it is
> loaded in full on every request. Rules that apply at one specific moment live
> in `.claude/skills/` (on demand) and `.claude/hooks/` (fire on the matching
> file edit) — see "Situational rules" below. Entry formats for
> `docs/DECISIONS.md` and `docs/LEARNING.md` live in those files, not here.
>
> Another tool reading this file gets everything that shapes code and **not**
> the situational workflow. Cursor and Antigravity configs were deleted rather
> than left half-alive; rebuild from this file if one is picked up again
> (`docs/DECISIONS.md` → "Claude Code як єдиний підтримуваний інструмент").

## Stack

- Runtime: Node.js 24+
- Language: TypeScript 6+ (strict mode, no exceptions)
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

## API Conventions

`docs/API-CONVENTIONS.md` holds the binding cross-cutting contract every
endpoint obeys: status codes, error shape, ownership checks, money and currency
representation, date types, pagination, soft delete, transfers. Read it before
writing or changing a handler — it is what keeps modules agreeing with each
other instead of each inventing its own shape.

Changing a rule there is an architectural decision: append to
`docs/DECISIONS.md` first, then update the conventions file.

## Handler Pattern

Every route handler we own must follow this order:
1. Validate input with Zod schema
2. Verify the authenticated user owns every entity referenced by an id in the
   payload — a foreign key proves the row exists, not whose it is. Missing this
   check is an IDOR that neither Zod nor the database catches
   (see `docs/API-CONVENTIONS.md` §1)
3. Business logic
4. Typed response with correct HTTP status code

`/api/auth/*` is mounted straight onto Better Auth's handler and is exempt by
decision — it has no wrapper of ours to apply this to
(`docs/API-CONVENTIONS.md` §2).

## Error Handling

- Use specific HTTP codes: 400 (malformed JSON only — the body could not be
  parsed), 401 (no valid session), 404 (path resource missing or not yours),
  422 (well-formed but invalid: failed validation, a body id owned by someone
  else, duplicate keys), 500 (server error)
- No 403 and no 409 — another user's resource is 404 when addressed by path but
  422 when its id arrives in a body; duplicates are 422
  (`docs/API-CONVENTIONS.md` §3)
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

## Situational rules

These do not shape the code you write, they apply at a specific moment. They
live outside this file so it stays what gets loaded on every request.

| When | Where it lives |
|---|---|
| Starting a task, branching, labels, issue links, committing | skill `task-workflow` |
| Opening a PR, handling CodeRabbit review | skill `pr-workflow` |
| Editing `src/db/schema.ts`, adding a migration or a route module | hook `.claude/hooks/doc-rules.cjs` (fires by itself) |

## Documentation duties

Each of these has a **home file that documents its own format** — go there for
the shape of an entry, do not reproduce it here. `.claude/hooks/doc-rules.cjs`
raises the ones with a reliable file trigger at the moment they apply.

- **Architectural decision** — any trade-off between viable approaches (schema
  design, cascade/delete behaviour, auth strategy, caching, indexing, data
  types) → append to `docs/DECISIONS.md`. Append only; corrections go in as a
  new "Уточнення" entry that names the record it supersedes.
- **Backend concept appearing for the first time** (migrations, transactions,
  indexes, middleware, rate limiting, queues, caching, OpenAPI, CI, deploy…) →
  append to `docs/LEARNING.md`.
- **Checkpoint or task completed** → tick it in `docs/PROGRESS.md`. Follow-up
  work discovered on the way becomes a new unchecked item, never a silent
  omission.
- **Endpoint added or changed** → matching request in `api.http`, so it stays a
  runnable map rather than a snapshot.
- **Local dev workflow changed** (new tool, npm script, docker service, way to
  inspect state) → `docs/ONBOARDING.md`.
- **The shape of what this API is changed** → the "Status", "API surface" and
  if relevant "Architectural decisions" sections of **both** `README.md` and
  `README.uk.md`; the two language versions are one artifact and never diverge.
  Triggers: a domain entity ships its first endpoint, the auth/data model/
  deployment story changes, or a new decision contradicts what the README
  claims. Not triggers: a filter param, a bug fix, a test, a refactor. The
  README is the only public-facing document here, and it has already drifted
  once into describing a data model this project rejected in its very first
  decision.

