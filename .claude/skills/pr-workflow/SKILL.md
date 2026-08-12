---
name: pr-workflow
description: What to run before opening a pull request in this repo, and how to handle CodeRabbit review comments afterwards. Use when opening a PR, preparing to push, reading review feedback, deciding whether a review comment needs a written reply, or wondering who resolves review threads.
---

# Pull request workflow

Moved out of `AGENTS.md` so it loads at PR time rather than in every request.

## Before opening a PR

```bash
npm run lint && npm run typecheck && npm test
```

`npm test` needs Docker running — the integration suite goes against a real
PostgreSQL on `localhost:5433`. If Docker is down the suite fails on
`ECONNREFUSED` in `src/test/global-setup.ts`; that is infrastructure, not a
code failure, but the rule is still unmet. Say so plainly rather than
reporting a green run.

The PR description follows `.github/pull_request_template.md`. `n/a` is a
required answer on items that do not apply — a blank box cannot be told apart
from a forgotten one.

## After CodeRabbit reviews

Read every comment and act on each one. Write a reply in the thread when —
and only when — one of these holds:

- you disagree with the comment
- you fixed it **differently** from what was suggested
- the fix is such that the diff alone does not show why

A verbatim fix needs no reply: the diff and the commit message are already
the record. When unsure whether a case qualifies, write the reply.

Never dismiss a comment silently (`CONTRIBUTING.md` → PR Rules). Silence and
a verbatim fix are different things; the first is not allowed, the second
needs no words. The reasoning behind narrowing this rule is in
`docs/DECISIONS.md` → "Відповідь на коментар CodeRabbit — за винятком, не за
замовчуванням".

## How CodeRabbit actually behaves

Measured on PR #59 rather than assumed:

- **It resolves threads itself.** All nine threads closed without a manual
  resolve — seven on its incremental pass over the fix commit, two after it
  withdrew comments it had been argued out of. Do not resolve by hand.
- **Replies come back in seconds** (18 and 20 on that PR), independent of
  whether a full review pass has finished. So disagree as soon as you see a
  comment rather than waiting for the run to complete.
- **It withdraws comments** when the counter-argument holds, and says so
  explicitly.

## Reviewing before you push

`/code-review` runs against the working diff and `/security-review` against
the pending changes on the branch. Running them before pushing means
CodeRabbit reviews an already-cleaned diff, which matters while the account
is on a rate-limited plan.

`/code-review` findings go through `discuss-comments` (triage the findings,
decide fix-or-skip) and then `implement-comments` (apply what was accepted).
CodeRabbit comments have their own front end, `discuss-rabbit`, which fetches
them, applies the reply rule above per comment, posts the disagreements
immediately, and feeds the same `implement-comments`.
