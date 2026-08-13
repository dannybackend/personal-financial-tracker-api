---
name: implement-comments
description: Apply the triaged plan produced by /discuss-comments — the fixes that were accepted, in the form they were accepted, on a cheaper model. Use after the review findings have been triaged and the decisions are settled.
disable-model-invocation: true
model: sonnet
effort: high
---

# Applying a triaged review plan

Third step of the review flow (`/code-review` → `/discuss-comments` → here).
Everything that needed judgment was settled in the previous turn; this turn is
execution, which is why it runs on a cheaper model. The override lasts exactly
this turn — the session returns to its own model afterwards, ready for the
next review.

Runs **in this session, not forked**: the plan is in the conversation above,
and edits made by a subagent are not restored by `/rewind`.

## The plan is the scope

Execute the **Робимо** and **Робимо інакше** buckets from the plan above,
exactly as written. Do not:

- do anything from **Не робимо**, however small — with one exception: when the
  plan calls for a `docs/PROGRESS.md` entry recording that a **Не робимо**
  item is deferred rather than dropped, add that entry. Writing the entry is
  not doing the deferred work; leave the work itself untouched.
- apply the reviewer's original suggestion where the plan chose a different
  fix — the difference is the decision
- fix anything the review found but the plan left out; if something looks
  wrong and is not in the plan, say so at the end instead of acting

A plan item that turns out to be wrong or impossible is a stop-and-report, not
a judgment call to make here.

## While applying

`AGENTS.md` applies as in any turn — handler order, error codes, no `any`,
JSDoc on exported functions. The `doc-rules` hook fires on edits to
`src/db/schema.ts`, migrations and route modules; follow what it raises rather
than batching documentation to the end.

An item that adds a deferred follow-up to `docs/PROGRESS.md` is part of the
plan, not bookkeeping to skip — this is the same exception named above,
restated because it is easy to read "do nothing from Не робимо" too literally
and skip the entry along with the work.

## Replies, when the plan came from `/discuss-rabbit`

A plan built from CodeRabbit comments carries drafted replies marked
`відповідь після виправлення`. Post each one **after** its fix is applied and
the suite is green — the reply describes work that exists, so posting it
before the fix makes it false.

```bash
gh api --method POST \
  "repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies" \
  -f body="$(cat <<'EOF'
<the drafted text>
EOF
)"
```

Post the text as drafted. If applying the fix changed what is true — a
different approach, a follow-up that turned out unnecessary — say so in the
final report and leave that reply unposted rather than rewriting it here; the
user approved specific wording. Never resolve a thread (`pr-workflow`).

A plan from `/discuss-comments` has no replies in it; skip this section.

## Finishing

```bash
npm run lint && npm run typecheck && npm test
```

`npm test` needs Docker (`pr-workflow` has the detail). If it is down, say so
plainly and report the suite as unrun — never as passing.

**Do not commit.** Writing code and committing are separate steps
(`task-workflow`).

Close with one line per plan item — applied, or applied differently and how,
or blocked and why. The user triaged eleven findings to get this list; the
report is how they confirm the list is what actually landed.
