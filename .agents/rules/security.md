---
trigger: glob
globs: src/routes/**,src/middleware/**
description: Security rules for routes and middleware
---

# Security

- Validate and sanitize all input before DB queries (Zod first)
- Rate limit auth and sensitive endpoints
- Never commit secrets — use environment variables validated with Zod at startup
- Never log passwords, tokens, or PII
