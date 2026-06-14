---
trigger: glob
globs: src/db/**
description: Drizzle ORM schema and migration rules
---

# Database

- Schema in `src/db/schema.ts`, migrations in `src/db/migrations/`
- Use Drizzle ORM — no raw SQL strings unless absolutely necessary
- Use transactions when modifying multiple tables
- Comment on intentionally skipped indexes
