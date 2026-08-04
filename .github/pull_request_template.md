## What changed

<!-- One or two sentences: what this PR does and why. Not how. -->

Closes #

---

## Documentation rules

`AGENTS.md` defines these as "When you..." rules. They are kept by discipline
alone, and discipline has already drifted twice — `ONBOARDING.md` claimed the
accounts endpoints did not exist after they shipped, and `README.md` described
a data model the project rejected in its first decision.

Tick what applies. `n/a` is a valid answer — write it instead of leaving a box
blank, so the difference between "did not apply" and "forgot" stays visible.

- [ ] **Made an architectural decision** (schema, cascade behaviour, auth, caching, indexing, data types) → new entry appended to `docs/DECISIONS.md`. Append only — never rewrite or delete an existing entry; corrections go in as a new "Уточнення" entry.
- [ ] **Completed a checkpoint or task** → item checked off in `docs/PROGRESS.md`. Work discovered along the way is added as a new unchecked item, not silently dropped.
- [ ] **Added or changed an endpoint** → matching request added or updated in `api.http`.
- [ ] **Introduced a backend concept for the first time** (migrations, transactions, indexes, middleware, rate limiting, queues, caching, OpenAPI, CI, deployment…) → entry appended to `docs/LEARNING.md`.
- [ ] **Changed local dev workflow** (new tool, npm script, docker service, way to inspect state) → `docs/ONBOARDING.md` updated.
- [ ] **Changed the shape of what this API is** (new entity's first endpoint, auth/data-model/deployment change, or a decision that contradicts what the README claims) → "Status" / "API surface" / "Architectural decisions" updated in **both** `README.md` and `README.uk.md`. Not triggered by a filter param, a bug fix or a refactor.

## API contract

- [ ] Handler follows the 4-step pattern, including step 2 — ownership verified for **every** id arriving in a request body (`docs/API-CONVENTIONS.md` §1). Routes delegated to Better Auth (`/api/auth/*`) are exempt by decision (§2)
- [ ] Response conforms to **every applicable section** of `docs/API-CONVENTIONS.md` §3–§11 — status codes, error shape, money, currency, dates, pagination, soft delete, transfers, naming. Not only the sections you happened to remember
- [ ] Every new endpoint has at least one integration test

## Checks

```bash
npm run lint && npm run typecheck && npm test
```

- [ ] All three pass locally

## After CodeRabbit reviews

Every comment gets a fix or a reply explaining why not — never a silent
dismissal, even when the underlying code gets fixed anyway. The explanation is
part of the record (`CONTRIBUTING.md` → PR Rules).
