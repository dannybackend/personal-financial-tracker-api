# API Conventions

> Cross-cutting invariants every endpoint in this API must obey.
>
> **Why this file exists:** `AGENTS.md` says *how to work*; `docs/DECISIONS.md`
> records *what was decided and why*, append-only. Neither is a place to look
> up "what shape does a money field have" while writing a handler. Without a
> single contract, each module re-invents its own — and the modules stop
> agreeing with each other.
>
> Written in English to match `AGENTS.md` and `CONTRIBUTING.md`, which agents
> load alongside it. The narrative docs (`BOOTSTRAP.md`, `DECISIONS.md`,
> `LEARNING.md`, `ROADMAP.md`, `PROGRESS.md`, `ONBOARDING.md`) stay Ukrainian.
>
> Rules here are **binding**. Changing one is an architectural decision: append
> an entry to `docs/DECISIONS.md`, then update this file.

**Conformance markers.** Every numbered section opens with one, and a
subsection carries its own where it diverges from its parent. A marker answers
a single question — *does the code you are about to read already satisfy this
rule?* — and nothing else. Whether the rule applies is never in question; it
always applies.

| Marker | Meaning |
|---|---|
| ✅ **holds** | Shipped code satisfies this. Safe to rely on while reading the codebase. |
| ✅ **holds, vacuously** | Nothing violates it because nothing exercises it yet — so there is no worked example to copy either. |
| 🔧 **debt #NN** | Binding for anything you write now. Existing code is *not* yet in line, so do not infer the rule from what you read. |

**When a marker flips.** This paragraph is the *only* statement of that rule.
`.github/pull_request_template.md`, `docs/ONBOARDING.md` and `docs/DECISIONS.md`
point here instead of restating it — a rule written down in four places is a
rule with four chances to disagree with itself, which is the failure this whole
file exists to prevent.

- A `🔧` flips to `✅` in the pull request that closes the **last** of the issues
  its marker names. A marker may name several (`🔧 debt #38, #39, #41`); partial
  progress earns nothing.
- When one of several closes and others remain, **drop it from the marker in
  that same pull request**. Every number still listed has to be open — a marker
  is the outstanding work, not a history of it, and `npm run check:markers`
  fails on a closed number rather than guessing which reading was meant.
- Only numbers on the **marker line** gate the flip. Numbers in the section's
  prose are context.
- A `✅` may still cite an open issue — for an adjacent gap the rule does not
  cover, or for the first case that will exercise it. That does not weaken it.
- `npm run check:markers` fails the build when a marker names an issue that has
  since closed, or when a numbered section carries no marker at all. It cannot
  check the other direction: nothing static knows that a new route module broke
  a `✅`. That one stays with review.
- **A missed flip is the one thing it cannot catch before merge.** Everything
  else it reports — a section with no marker, a number that is not an issue, a
  document it can no longer parse — is decided from the file alone and turns
  the pull request red. But `Closes #NN` closes the issue at *merge*, so while
  the PR is open that number is still open and the job is green whether or not
  the marker was flipped; the run that goes red is the next one on `main`. For
  that one case the gate before merge is the checkbox in
  `.github/pull_request_template.md`, and this check is the detector after it.

A `🔧` is never permission to skip the rule in new code — it is a warning that
the codebase is the wrong place to learn it from. Rationale:
`docs/DECISIONS.md` → "Маркери відповідності коду в `API-CONVENTIONS.md`".

---

## Contents

Each row states the **rule**, not the state of the code. Whether the codebase
already satisfies it is the section's marker, not this table.

Every row is scoped to handlers this project owns. `/api/auth/*` is mounted
straight onto Better Auth and is exempt from all of them by decision — status
codes and error shape included. See §2 before applying any row to those paths.

| § | Topic | The rule in one line |
|---|---|---|
| [1](#1-ownership-the-rule-that-fks-do-not-enforce) | Ownership | Every id in a body is verified to belong to the caller |
| [2](#2-handler-order) | Handler order | Validate → verify ownership → logic → typed response |
| [3](#3-status-codes) | Status codes | No 403, no 409 — someone else's row is 404 by path but 422 by body id; duplicates are 422 |
| [4](#4-error-shape) | Error shape | One shape everywhere; internals never reach the client |
| [5](#5-money) | Money | `numeric(12,2)`, JSON string, must be positive; exactly one balance formula |
| [6](#6-currency) | Currency | `char(3)` ISO-4217; aggregates group by currency, never mix |
| [7](#7-dates-and-time) | Dates | `date` for when money moved, `timestamptz` for row metadata |
| [8](#8-pagination) | Pagination | Must use the shared primitive; hard max limit, deterministic order |
| [9](#9-soft-delete) | Soft delete | Accounts must archive rather than delete; history is never destroyed |
| [10](#10-transfers) | Transfers | Two rows, one `transfer_group_id`, excluded from reports |
| [11](#11-naming-and-shapes) | Naming | `camelCase` JSON, `snake_case` columns, `At` suffix on timestamps |

---

## 1. Ownership: the rule that FKs do not enforce

> ✅ **holds, vacuously** — and that is the important part. No handler accepts
> an id in a body yet (`src/routes/accounts.ts` takes `name`, `type`,
> `currency`), so nothing here can violate this rule — **and there is no worked
> example to copy either.** The `/accounts` handlers do scope by `userId`, but
> that is §3's path-id rule wearing similar clothes, not this one — every
> ownership test in `src/routes/accounts.test.ts` is an "another user's
> account" path-id 404, never a body-id 422. The first handler to take a body
> id (#15) writes both the check and its per-field test from this section, not
> from the codebase.

**Every id that arrives in a request body must be verified to belong to the
authenticated user before it is written.**

A foreign key guarantees the referenced row *exists*. It says nothing about
*whose* it is. Without an explicit check, this succeeds:

```http
POST /transactions { "accountId": "<another user's account>", "amount": "100.00" }
```

The FK is satisfied. The row is created with `user_id = attacker`,
`account_id = victim`. The victim's balance now includes the attacker's
transaction. This is a textbook IDOR, and neither Zod nor PostgreSQL catches it.

- Foreign key in the body owned by someone else → **422**
- Resource in the URL path owned by someone else → **404** (see §3)

The difference is deliberate: a path id is a resource the caller claims to
address, so we do not confirm it exists. A body id is *input*, and a 422 says
"this input is invalid" without confirming anything about the id itself.

Every endpoint that accepts an id in a body needs a test for this. Not a shared
"we check ownership" test — one per endpoint, per field.

---

## 2. Handler order

> ✅ **holds** — every route module we own follows the order; today that is
> `src/routes/accounts.ts` alone.

1. Validate input with Zod (`parseBody` / `parseParam` from `src/lib/validation.ts`)
2. **Verify ownership of every entity referenced by an id in the payload** (§1)
3. Business logic
4. Typed response with the correct status code

**Scope: handlers this project owns.** `/api/auth/*` is mounted straight onto
Better Auth's own handler (`auth.handler`, `src/app.ts`) and deliberately has no
wrapper of ours — see `docs/DECISIONS.md` → "Реєстрація напряму через
`/api/auth/sign-up/email`". Those routes therefore do not follow this order,
do not use `parseBody`/`parseParam`, and do not return our error shape. That is
a decision, not a gap; when Better Auth's behaviour and this contract disagree
on those paths, Better Auth wins. Everything mounted by us obeys §1–§11
without exception.

---

## 3. Status codes

> ✅ **holds** — 400/401/404/422 all issued as described. The duplicate-key
> clause has no code path *of ours* yet: the only `UNIQUE` constraints on a
> domain table are `users.auth_user_id` and `users.email` in
> `src/db/schema.ts`, and the sole insert into `users` is Better Auth's
> `onUserCreate` hook in `src/lib/auth.ts` — behind `/api/auth/*`, which §2
> exempts. So a
> unique violation is reachable today, but never through a handler bound by
> this contract. `categories` and `accounts` get their constraints in #41; the
> clause binds the first handler of ours that can trip one.

| Code | When |
|---|---|
| `200` | Successful read or update |
| `201` | Resource created |
| `204` | Successful delete, no body |
| `400` | Malformed JSON body — the request could not be parsed at all |
| `401` | No valid session |
| `404` | Resource **addressed in the URL path** does not exist or belongs to another user — indistinguishable by design |
| `422` | Well-formed request that fails validation, including an id **in the body** that belongs to another user (§1), and duplicate-key violations |
| `500` | Unexpected server error |

**No `403`.** Confirming "this exists, it just isn't yours" leaks the existence
of other users' resources. Same anti-enumeration instinct as the uniform
sign-up response. See `docs/DECISIONS.md` → "Доступ до чужого ресурсу — 404,
не 403".

**No `409`.** Duplicate-key violations surface as `422`, consistent with all
other validation failures.

---

## 4. Error shape

> 🔧 **debt #49, #50** — `parseBody`/`parseParam` already return this shape,
> but there is no global handler behind them: `src/app.ts` defines neither
> `onError` nor `notFound` (#49), and `requestId` does not exist anywhere in
> `src/` (#50, which brings the logging it is meant to point at). Both must
> land — a `requestId` field nobody can look up is not this contract.

One shape, everywhere — including the global error handler:

```json
{ "error": "Validation failed", "details": { }, "requestId": "..." }
```

- `error` — a safe, human-readable string. Never a driver message, never a
  table or column name, never a stack trace.
- `details` — optional, only for validation failures (`z.treeifyError`).
- `requestId` — present on 5xx so a user can quote it and you can find the log
  line.

Internal errors are logged in full and returned as a generic message — a hard
rule from `AGENTS.md` ("Never leak internal errors to the client").

Once #49 lands, the global handler is what enforces that, and a handler needs
no guard of its own. **Until then there is no net.** An unhandled `throw` —
`src/middleware/auth.ts` contains one today — reaches Hono's default and
answers `Internal Server Error` as plain text, outside this shape entirely.
Nothing leaks right now, but Hono's default is what earns that, not us. Do not
read this section as licence to let an error escape a handler you are writing.

---

## 5. Money

> 🔧 **debt #37** — the column type and the string serialization hold.
> `CHECK (amount > 0)` is absent from `src/db/schema.ts`, and the balance
> formula has no implementation anywhere; #37 covers both. (#44 is its first
> consumer, not a second gap — it does not gate this marker.)

- Stored as `numeric(12, 2)`. Never `float` — `0.1 + 0.2 !== 0.3` is
  unacceptable for financial data.
- **Serialized as a JSON string**, never a number: `"amount": "1234.56"`.
  Drizzle returns `numeric` as a string precisely so precision survives; turning
  it into a JS number to look tidy throws that away.
- Always positive in storage. `CHECK (amount > 0)` in the database and
  `.positive()` in Zod. Direction comes from `type`, never from a minus sign.
- Zero is not a valid amount.

### Canonical balance formula

```sql
SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END)
```

There will be exactly one implementation of this, in `src/lib/` (#37, first
consumed by #44). **It does not exist yet** — do not go looking for it. If you
need a balance before #37 lands, create it there and import it; do not inline
a second copy that later has to be hunted down. A plain `SUM(amount)` computes
turnover, not balance — do not write one.

Balances are always computed, never stored. See `docs/DECISIONS.md` → "Баланс
рахунку рахується динамічно".

---

## 6. Currency

> ✅ **holds** — the representation rules below shipped in #36. One deliberate
> gap, documented in `src/db/schema.ts`: `budgets.currency` carries the `CHECK`
> but not `.$type<Currency>()`, because no `/budgets` route validates it
> against `currencySchema` yet (#18). **"Aggregation rule" further down carries
> its own marker** — it is not covered by this one.

- `char(3)`, uppercase ISO-4217, validated against the shared Zod enum in
  `src/lib/currency.ts` (`currencySchema`). Not free text.
- Two independent layers, on purpose: the database `CHECK` constraint enforces
  only the *shape* (`^[A-Z]{3}$`) — it exists so nothing can bypass Zod and
  write garbage directly. `currencySchema` enforces the *set* of codes this
  API actually accepts. Adding a currency is a one-line change to the enum,
  never a migration.
- Case is not normalized. `"usd"` is `422`, not silently upper-cased — what the
  client sent always matches what gets stored and returned.
- Currency lives on the **account**. A transaction inherits its account's
  currency and never carries its own.
- A budget carries its own currency explicitly.
- An account's currency is **immutable** after creation — `PATCH /accounts/:id`
  rejects a `currency` field with `422` rather than ignoring it. See
  `docs/DECISIONS.md` → "Уточнення: валюта рахунку незмінна після створення".
  Unlike the format check above, this immutability is enforced only at this
  HTTP boundary, deliberately — no database-level guard (e.g. a trigger)
  backs it. See `docs/DECISIONS.md` → "Уточнення: незмінність валюти рахунку
  — лише на рівні застосунку, свідомо" for why.

### Aggregation rule

> 🔧 **debt #45, #46, #47** — nothing sums money across accounts yet
> (`src/routes/` holds only `accounts.ts`), so **no `byCurrency` response
> exists to copy**. Build the shape from this text, not from a sibling report.

**Any endpoint that sums money across more than one account groups by currency
and never mixes.** A total that adds UAH to USD is a meaningless number that
looks like a number — the worst kind of bug, because nothing fails.

Report responses therefore nest under `byCurrency`, even when the user has a
single currency. Uniform shape beats a special case.

Rate conversion is Phase 2. Until it exists, spending from an account in
currency X never counts toward a budget in currency Y — a documented,
intentional consequence, not a gap.

---

## 7. Dates and time

> 🔧 **debt #38, #39, #41** — no row of the table below holds today, and the
> gaps belong to three different issues. `transactions.date` is declared
> `timestamp('date', { mode: 'date' })` in `src/db/schema.ts` — a timestamp
> column with a misleading name, i.e. exactly the bug this section explains —
> and every `created_at` is `timestamp`, not `timestamptz`; both are #38.
> `updated_at` exists on no domain table (#41), `archived_at` on none either
> (#39). The `from`/`to` range params have no endpoint to sit on yet.

| Field kind | Type | JSON |
|---|---|---|
| `transactions.date` — when the money moved | `date` | `"2026-08-01"` |
| `created_at` / `updated_at` / `archived_at` | `timestamptz` | ISO-8601 with offset |

A transaction has a calendar date, not an instant. Storing it as a timestamp
makes "spending in July" depend on the server's timezone — the same value
lands in different months on a UTC+3 laptop and a UTC container.

`auth_*` tables are owned by Better Auth and are **not** re-typed; changing
them breaks the adapter.

Date-range query params are `from` / `to`, inclusive, `YYYY-MM-DD`, with
`from <= to` and a maximum span of 366 days.

---

## 8. Pagination

> 🔧 **debt #16, #72** — no shared primitive exists. #16 builds it for
> transactions; #72 retrofits `GET /accounts`, which today accepts neither
> `limit` nor `offset` and carries no `ORDER BY` at all — so its order is
> unspecified, and nothing obliges two identical requests to agree on it.
> Closing #16 alone does not earn a ✅ here: it does not touch `/accounts`.

Every list endpoint uses the shared primitive in `src/lib/` — not a per-module
implementation. **It does not exist yet** (#16): the first list endpoint that
needs paging creates it there, and `GET /accounts` is retrofitted onto it
rather than growing a second one of its own.

- `limit` has a hard maximum (100). Without one, `?limit=999999` is a
  denial-of-service against your own database, delivered by a legitimate route.
- `limit` and `offset` are Zod-validated; invalid values are `422`, not
  silently clamped.
- Ordering is always deterministic (`date DESC, id DESC`). Without a tiebreaker,
  rows with equal dates get duplicated across pages and others get skipped.

**Open question.** Offset vs cursor is decided in #16. Once chosen, the
response shape goes here and applies to every list endpoint retroactively.
`accounts` has no `date` column, so the `date DESC, id DESC` ordering above is
transaction-shaped — #72 settles whether the rule generalises to "section key
plus `id`" or `/accounts` gets a stated exception.

---

## 9. Soft delete

> 🔧 **debt #15, #39, #45, #46, #47** — `archived_at` does not exist, and
> `DELETE /accounts/:id` hard-deletes the row; its transactions follow through
> `ON DELETE CASCADE`. Shipped behaviour is the **opposite** of this section:
> the destruction of history it forbids is what the endpoint does today (#39).
> Two bullets below reach past #39 — rejecting a write against an archived
> account needs transactions to exist at all (#15), and "reports include
> archived accounts" needs reports (#45, #46, #47).

`accounts` are archived, not deleted (`archived_at`). Deleting an account must
never take its transaction history with it — the same reasoning already applied
to categories, where deletion leaves transactions with `category_id = null`.

- `GET /accounts` lists only `archived_at IS NULL`
- `GET /accounts/:id` still returns an archived account, so history has
  something to point at
- Creating or updating a transaction against an archived account → `422`
- Reports **include** transactions from archived accounts. History is history.

`categories`, `transactions` and `budgets` are hard-deleted; their deletion
does not destroy anything that cannot be reconstructed.

---

## 10. Transfers

> 🔧 **debt #42, #45, #46, #47** — neither `transfer_group_id` nor any transfer
> endpoint exists (#42), and the report-exclusion rule below has no report to
> apply to (#45, #46, #47). Nothing in the codebase demonstrates this shape;
> the section below is the entire specification.

A transfer between the user's own accounts is **two rows** sharing a
`transfer_group_id`, written inside one `db.transaction()`: an `expense` on the
source, an `income` on the destination, `category_id = null` on both.

**Every income/expense report excludes rows where `transfer_group_id IS NOT
NULL`.** Otherwise moving 10 000 from a card to a deposit shows up as having
spent 10 000 — the report lies about the largest numbers in the dataset.

Balance queries need no special case: the expense sits on the source account
and the income on the destination, so §5 already handles it.

---

## 11. Naming and shapes

> ✅ **holds** — Drizzle maps `camelCase`↔`snake_case`, `GET /accounts` returns
> a bare array, and `createdAt` carries the `At` suffix. The boolean rule is
> the exception, and it is vacuous: no table declares a boolean column yet, so
> `isArchived` arrives with #39 and has no precedent to copy until it does.

- JSON is `camelCase`; database columns are `snake_case`. Drizzle maps between
  them — no manual renaming in handlers.
- Collections return a bare array (or the paginated envelope from §8), never
  `{ "data": [...] }` wrapped one level deep for no reason.
- Booleans read as assertions: `isArchived`, not `archived` or `archiveFlag`.
- Timestamps end in `At`; calendar dates do not.
