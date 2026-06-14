# Project Instructions for Codex

> Single source of truth for AI agents (Codex / VS Code / Antigravity).
> Cursor uses scoped rules in `.cursor/rules/` — keep both in sync when changing standards.
> Antigravity uses scoped rules in `.agents/rules/` — keep both in sync when changing standards.

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

## Task Scope
- Tackle one endpoint or one module at a time
- After generating code, summarize what was done and flag any edge cases not yet handled
