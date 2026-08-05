---
name: task-workflow
description: How work is tracked, branched, labelled and committed in this repo. Use when starting a task, picking up a GitHub issue, creating a branch, filing or linking issues, or deciding whether to commit. Covers branch naming, Closes keywords, labels, blocked-by links, the status board, and the rule that writing code and committing are separate steps.
---

# Task workflow

Moved out of `AGENTS.md` so it loads when you are actually starting or
finishing a task, rather than in every request that only edits code.

## Tracking

Work is tracked as GitHub Issues on this repo, grouped into milestones per
feature area. Before starting a task, check the issue for current,
authoritative scope (`gh issue view <number>`) — descriptions may be edited
after creation as understanding changes.

- **Branch naming:** `{issue-number}-{slugified-issue-title}` (matches GitHub's
  own "Create a branch" button on an issue). Work not tied to a single
  numbered issue (cross-cutting docs/process cleanup) uses `{type}/{slug}`
  instead (e.g. `fix/docs-consistency-cleanup`) — same convention already
  used by past PRs like `feat/document-task-tracking-workflow`.
- **PR description includes `Closes #<number>`** so merging auto-closes the
  issue. This only works from the PR description itself, or from a commit
  message once that commit is merged into the default branch (the commit
  doesn't need to be made directly on the default branch, just end up
  there) — never from a PR comment, GitHub does not parse comments for
  closing keywords.
- **Labels:** `type:feature`, `type:testing`, `type:infra`, `type:docs` — pick
  the one matching the primary nature of the work.
- **Shared or cross-cutting work** needed by multiple other issues (e.g. a
  middleware several endpoints depend on) gets its own tracked issue, filed
  under the first milestone that needs it — don't build it silently inside
  whichever issue happens to need it first.
- **Hard prerequisites between issues** must be linked structurally, not just
  mentioned in prose: `gh issue edit <blocked> --add-blocked-by <blocker>`.
  A developer opening the blocked issue cold must see the dependency in
  GitHub's own UI, not have to infer it from a conversation they weren't
  part of.
- **Status board:** https://github.com/users/Danny-Lenko/projects/1 (owned by
  the maintainer's personal account, not the repo — won't appear in the
  repo's own Projects tab; `gh project item-list 1 --owner Danny-Lenko`
  works from any session). Fields: `Status` (Todo / In Progress / Done) and
  `Priority` (P0–P3).

## Scope

- Tackle one endpoint or one module at a time.
- After generating code, summarize what was done and flag any edge cases not
  yet handled.

## Commit discipline

Writing code and committing/pushing it are separate steps, each needing
its own approval. After implementing a change, stop, summarize what
changed, and wait — "implement X" is not itself approval to commit.

Bundling is fine when the change was already discussed in this
conversation and is small (e.g. applying a single review comment) — "yes,
go ahead" can cover both the fix and the commit then. For anything larger
or new, get explicit confirmation before committing.

## Working two branches at once

Commit before switching; `git stash` is an emergency tool, not part of the
normal flow. A branch is a commit you stand on, not a place you visit with
uncommitted work in hand.

Independent work branches from a freshly pulled `main`. Work that needs
behaviour not yet in `main` branches from the branch that carries it.

After the base branch merges, bring it in with `git merge main` — not
`rebase` — when your branch is already pushed and has an open PR, because
rebasing rewrites history and forces a push that breaks review threads.
