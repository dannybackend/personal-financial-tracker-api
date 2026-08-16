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

- [ ] **Made an architectural decision** (schema, cascade behaviour, auth, caching, indexing, data types) → new entry in `docs/DECISIONS.md`, written per that file's header, which is the only statement of the entry format and of how corrections are recorded.
- [ ] **Completed a checkpoint or task** → item checked off in `docs/PROGRESS.md`. Work discovered along the way is added as a new unchecked item, not silently dropped.
- [ ] **Added or changed an endpoint** → matching request added or updated in `api.http`.
- [ ] **Introduced a backend concept for the first time** (migrations, transactions, indexes, middleware, rate limiting, queues, caching, OpenAPI, CI, deployment…) → entry appended to `docs/LEARNING.md`.
- [ ] **Changed local dev workflow** (new tool, npm script, docker service, way to inspect state) → `docs/ONBOARDING.md` updated.
- [ ] **Changed the shape of what this API is** (new entity's first endpoint, auth/data-model/deployment change, or a decision that contradicts what the README claims) → "Status" / "API surface" / "Architectural decisions" updated in **both** `README.md` and `README.uk.md`. Not triggered by a filter param, a bug fix or a refactor.

## API contract

- [ ] Handler follows the 4-step pattern, including step 2 — ownership verified for **every** id arriving in a request body (`docs/API-CONVENTIONS.md` §1). Routes delegated to Better Auth (`/api/auth/*`) are exempt by decision (§2)
- [ ] Response conforms to **every applicable section** of `docs/API-CONVENTIONS.md` §3–§11 — status codes, error shape, money, currency, dates, pagination, soft delete, transfers, naming. Not only the sections you happened to remember
- [ ] Every new endpoint has at least one integration test
- [ ] **Closed an issue named by a `🔧` marker in `docs/API-CONVENTIONS.md`** → the marker is updated here, per the flip rule in that file's "Conformance markers" legend (deliberately not restated in this template). `npm run check:markers` fails CI when a marker names an issue that has since closed

## Checks

```bash
npm run lint && npm run typecheck && npm test
```

- [ ] All three pass locally
- [ ] `npm run check:config-paths` passes — it needs no token and no network, so there is nothing to arrange before running it
- [ ] `npm run check:toc` passes — regenerate with `npm run toc` after adding or renaming an entry in a document that carries a table of contents
- [ ] `npm run check:markers` passes — needs a GitHub token, which is why it is not in the line above (`docs/ONBOARDING.md` → "Корисні команди")

## After CodeRabbit reviews

Every comment is fixed or answered, per the reply rule in the skill
`pr-workflow` — deliberately not restated here. The copy that used to sit in
this section outlived the rule it quoted: it still demanded a reply to every
comment after that rule had been narrowed to three cases. Reasoning:
`docs/DECISIONS.md` → «Відповідь на коментар CodeRabbit — за винятком, не за
замовчуванням».
