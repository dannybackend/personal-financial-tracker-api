---
trigger: always_on
description: Core stack and TypeScript standards for every session
---

# Core

## Stack
Node.js 24+ · TypeScript 5+ (strict) · Hono · Drizzle ORM · PostgreSQL · Zod · Better Auth · Vitest · Redis · BullMQ · Scalar + OpenAPI

## Structure
```
src/routes/     src/db/     src/middleware/     src/lib/     src/types/
```

## TypeScript
- Strict mode always. No `any` — use `unknown` and narrow.
- Named exports only. Explicit return types on exported functions.
- One function = one responsibility. Descriptive names (`userId`, not `uid`).

## Scope
- Tackle one endpoint or one module at a time.
- After generating code, summarize what was done and flag any edge cases not yet handled.
