---
name: discuss-comments
description: Walk through the findings of a /code-review one at a time, decide with the user what to do with each, and leave a triaged plan for /implement-comments. Use right after /code-review reports findings, or when review comments need a fix-or-skip decision before any code is touched.
disable-model-invocation: true
model: opus
effort: high
disallowed-tools: Edit Write NotebookEdit
---

# Triaging review findings

Second step of the review flow: `/code-review` finds, this skill decides,
`/implement-comments` executes. The split exists because deciding and
executing want different models — see `pr-workflow` for where the flow sits
relative to a PR.

**Finish in one turn.** The `model` override above dies at the end of this
turn, so the whole walkthrough — every explanation, every question, the final
plan — happens before control returns to the user. Ask with
`AskUserQuestion`, which answers inside the turn; never end the turn with a
question in prose.

**Read-only.** `Edit` and `Write` are removed for the duration. A finding is
not fixed here even when the fix is one character.

## Per finding

Take the findings in the order the review reported them (most severe first)
and for each one give, in this order:

1. **What it means**, in plain language — the failure, not the category. A
   finding the user cannot picture failing cannot be judged.
2. **Your verdict, with the reason.** Agree, disagree, or agree-but-differently.
   A reviewer that never disagrees is not adding anything; when the proposed
   fix is heavier than the problem, say so and name the lighter one.
3. **The question**, via `AskUserQuestion` — batch four findings per call
   (the tool's maximum) rather than one dialog per finding. Options are
   `Виправити як запропоновано` / `Виправити інакше` / `Не робити зараз`, with
   your recommendation first and `(рекомендую)` on it.

## The plan

End the turn with the triaged list in three buckets, in the user's language,
each item naming the file it touches:

```text
## Робимо        — verbatim, in the order they should be applied
## Робимо інакше — what instead, and why the original was rejected
## Не робимо     — with the reason it was declined
```

This list is what `/implement-comments` executes, so it has to be precise
enough to act on without re-deriving anything: no "виправити міграцію", but
"0001_rapid_tomas.sql: backfill трьома кроками для accounts і budgets".

Anything in **Не робимо** that is real work merely deferred becomes a new
unchecked item in `docs/PROGRESS.md` — name it in the plan so the next step
adds it. `AGENTS.md` requires this; a decision to postpone is not the same as
a decision to drop, and only the file remembers the difference.
