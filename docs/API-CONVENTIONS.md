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
> load alongside it. The narrative docs (`DECISIONS.md`, `LEARNING.md`,
> `ROADMAP.md`, `PROGRESS.md`, `ONBOARDING.md`) stay Ukrainian.
>
> Rules here are **binding**. Changing one is an architectural decision: append
> an entry to `docs/DECISIONS.md`, then update this file.

---

## Contents

| § | Rule | One-line version |
|---|---|---|
| [1](#1-ownership-the-rule-that-fks-do-not-enforce) | Ownership | Every id in a body is verified to belong to the caller |
| [2](#2-handler-order) | Handler order | Validate → verify ownership → logic → typed response |
| [3](#3-status-codes) | Status codes | No 403, no 409 — someone else's row is 404, duplicates are 422 |
| [4](#4-error-shape) | Error shape | One shape everywhere; internals never reach the client |
| [5](#5-money) | Money | `numeric(12,2)`, JSON string, always positive, one balance formula |
| [6](#6-currency) | Currency | `char(3)` ISO-4217; aggregates group by currency, never mix |
| [7](#7-dates-and-time) | Dates | `date` for when money moved, `timestamptz` for row metadata |
| [8](#8-pagination) | Pagination | Shared primitive, hard max limit, deterministic order |
| [9](#9-soft-delete) | Soft delete | Accounts archive; deletion never destroys history |
| [10](#10-transfers) | Transfers | Two rows, one `transfer_group_id`, excluded from reports |
| [11](#11-naming-and-shapes) | Naming | `camelCase` JSON, `snake_case` columns, `At` suffix on timestamps |

---

## 1. Ownership: the rule that FKs do not enforce

**Every id that arrives in a request body must be verified to belong to the
authenticated user before it is written.**

A foreign key guarantees the referenced row *exists*. It says nothing about
*whose* it is. Without an explicit check, this succeeds:

```
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

1. Validate input with Zod (`parseBody` / `parseParam` from `src/lib/validation.ts`)
2. **Verify ownership of every entity referenced by an id in the payload** (§1)
3. Business logic
4. Typed response with the correct status code

---

## 3. Status codes

| Code | When |
|---|---|
| `200` | Successful read or update |
| `201` | Resource created |
| `204` | Successful delete, no body |
| `400` | Malformed JSON body — the request could not be parsed at all |
| `401` | No valid session |
| `404` | Resource does not exist **or belongs to another user** — indistinguishable by design |
| `422` | Well-formed request that fails validation, including ownership of a body id |
| `500` | Unexpected server error |

**No `403`.** Confirming "this exists, it just isn't yours" leaks the existence
of other users' resources. Same anti-enumeration instinct as the uniform
sign-up response. See `docs/DECISIONS.md` → "Доступ до чужого ресурсу — 404,
не 403".

**No `409`.** Duplicate-key violations surface as `422`, consistent with all
other validation failures.

---

## 4. Error shape

One shape, everywhere — including the global error handler:

```json
{ "error": "Validation failed", "details": { }, "requestId": "..." }
```

- `error` — a safe, human-readable string. Never a driver message, never a
  table or column name, never a stack trace.
- `details` — optional, only for validation failures (`z.treeifyError`).
- `requestId` — present on 5xx so a user can quote it and you can find the log
  line.

Internal errors are logged in full and returned as a generic message. This is
a hard rule from `AGENTS.md` ("Never leak internal errors to the client") and
it is enforced by the global handler, not by handler-by-handler discipline.

---

## 5. Money

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

There is exactly one implementation of this, in `src/lib/`. A plain
`SUM(amount)` computes turnover, not balance — do not write one.

Balances are always computed, never stored. See `docs/DECISIONS.md` → "Баланс
рахунку рахується динамічно".

---

## 6. Currency

- `char(3)`, uppercase ISO-4217, validated against a shared Zod enum in
  `src/lib/`. Not free text.
- Currency lives on the **account**. A transaction inherits its account's
  currency and never carries its own.
- A budget carries its own currency explicitly.

### Aggregation rule

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

Every list endpoint uses the shared primitive in `src/lib/` — not a per-module
implementation.

- `limit` has a hard maximum (100). Without one, `?limit=999999` is a
  denial-of-service against your own database, delivered by a legitimate route.
- `limit` and `offset` are Zod-validated; invalid values are `422`, not
  silently clamped.
- Ordering is always deterministic (`date DESC, id DESC`). Without a tiebreaker,
  rows with equal dates get duplicated across pages and others get skipped.

> **Open:** offset vs cursor is decided in #16. Once chosen, the response shape
> goes here and applies to every list endpoint retroactively.

---

## 9. Soft delete

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

- JSON is `camelCase`; database columns are `snake_case`. Drizzle maps between
  them — no manual renaming in handlers.
- Collections return a bare array (or the paginated envelope from §8), never
  `{ "data": [...] }` wrapped one level deep for no reason.
- Booleans read as assertions: `isArchived`, not `archived` or `archiveFlag`.
- Timestamps end in `At`; calendar dates do not.
