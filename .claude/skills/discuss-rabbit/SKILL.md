---
name: discuss-rabbit
description: Walk through CodeRabbit's review comments on a PR one at a time, decide fix-or-argue with the user, post the disagreements immediately, and leave a triaged plan for /implement-comments. Use after CodeRabbit has reviewed a pull request.
argument-hint: [pr-number]
disable-model-invocation: true
model: opus
effort: high
disallowed-tools: Edit Write NotebookEdit
---

# Triaging CodeRabbit comments

The PR-side twin of `discuss-comments`: same rhythm, different source and one
extra axis. `/code-review` findings arrive in context; these live on GitHub and
have to be fetched. And every comment carries a second decision beyond
fix-or-skip — **whether it needs a written reply**.

**The reply rule is not restated here.** It lives in `pr-workflow` → "After
CodeRabbit reviews", together with the measured facts about how CodeRabbit
behaves. Read that skill's rule and apply it; do not paraphrase it into this
file. Two copies of one rule is the failure `docs/DECISIONS.md` → "Імпорт
AGENTS.md замість ручних витяжок" already records.

Two consequences of that rule worth making explicit here, because they shape
*this* walkthrough:

- **There is no silent skip.** A comment you decline still gets a reply. So
  "не робимо" is never an empty bucket entry — it always carries text.
- **Disagreements are posted during this turn, not deferred.** `pr-workflow`
  measured CodeRabbit replying in seconds and withdrawing comments it is
  argued out of. A disagreement that lands now may remove the work entirely
  before `/implement-comments` runs. Replies that describe a *different fix*
  are the opposite — they wait until the fix exists.

**Finish in one turn.** The `model` override dies at the end of it. Ask with
`AskUserQuestion`; never end the turn with a question in prose.

**Read-only on the working tree.** `Edit` and `Write` are removed. Posting a
reply is the one outward action this skill takes, and only per the gate below.

## Fetching

Resolve `owner`, `name`, and `pr` from the URL of the *resolved* PR — never
from `gh repo view`, which reads the current working copy's remote and can
name a different repository than the PR `$ARGUMENTS` actually pointed at:

```bash
pr=$(gh pr view ${ARGUMENTS:+"$ARGUMENTS"} --json url --jq '.url | capture("pull/(?<n>[0-9]+)").n')
owner=$(gh pr view ${ARGUMENTS:+"$ARGUMENTS"} --json url --jq '.url | capture("github[.]com/(?<o>[^/]+)/").o')
name=$(gh pr view ${ARGUMENTS:+"$ARGUMENTS"} --json url --jq '.url | capture("github[.]com/[^/]+/(?<n>[^/]+)/pull").n')
```

Then pull review threads via GraphQL, not the REST comments endpoint — REST
returns every inline comment ever posted, including this skill's own replies
and anything already resolved, with no `isResolved` field to tell them apart.
GraphQL's `reviewThreads` carries resolution state and groups replies under
their thread, so filtering to `isResolved: false` and each thread's first
comment (the top-level one — a reply can't be the target of a new reply
anyway) does in one call what REST needs a second, unfilterable call plus
manual bookkeeping to approximate. `originalLine` is included as a fallback
for a comment left on a line since deleted, where `line` comes back null.
Strip the `<details>` wrapper and HTML comments before capping the length:
the summary CodeRabbit shows by default is the severity/effort line, and the
actual finding is what's collapsed inside `<details>` — a raw prefix cut
returns that summary line and nothing else. `.[0:3000]` is a ceiling for a
single outsized comment (embedded code, a diff, an image), not a length that
routinely truncates - every comment on this PR's own findings fit in
315–1052 characters once the wrapper is gone:

```bash
gh api graphql -f query='
query($owner:String!, $name:String!, $pr:Int!) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$pr) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 1) {
            nodes { databaseId path line originalLine author { login } body }
          }
        }
      }
    }
  }
}' -F owner="$owner" -F name="$name" -F pr="$pr" --jq '
  .data.repository.pullRequest.reviewThreads.nodes[]
  | select(.isResolved==false)
  | .comments.nodes[0] as $c
  | select($c.author.login=="coderabbitai")
  | "===== id=" + ($c.databaseId|tostring) + " | " + $c.path + ":" + (($c.line // $c.originalLine // 0)|tostring) + " =====\n"
    + ($c.body
       | gsub("(?s)<details>.*?</details>"; "")
       | gsub("(?s)<!--.*?-->"; "")
       | gsub("\n{2,}"; "\n")
       | .[0:3000])'
```

Read the file around each comment's `path:line` before judging it. A comment
quoted without its surrounding code is a claim you cannot check.

## Per comment

Same three beats as `discuss-comments` — what it means in plain language, your
verdict with the reason, then the question — with the options carrying the
reply decision:

- `Виправити як запропоновано` — verbatim fix, no reply (the diff is the record)
- `Виправити інакше` — fix differently; reply drafted now, posted after the fix
- `Не згоден — відповісти зараз` — no fix; put the draft reply in the option's
  `description` so it is approved on its text, not on a description of it
- `Відкласти` — no fix now; put the draft reply in the option's `description`,
  same as `Не згоден` — plus an item for `docs/PROGRESS.md`

Batch four comments per `AskUserQuestion` call.

## Posting

Replies for comments that get **no fix** — `Не згоден` and `Відкласти` — are
posted in this turn, for the options the user picked with the text visible.
Both describe a decision that is already final; there is nothing left to wait
for. A `Виправити інакше` reply describes work that doesn't exist yet, so it
waits for `/implement-comments` to post it once that work is done. Nothing
else goes to GitHub from here.

```bash
comment_id=<id from the Fetching listing above>
gh api --method POST \
  "repos/$owner/$name/pulls/$pr/comments/$comment_id/replies" \
  -f body="$(cat <<'EOF'
<the approved text>
EOF
)"
```

**Never resolve a thread.** CodeRabbit resolves its own — `pr-workflow` has the
measurement.

## The plan

End with the same three buckets as `discuss-comments`, in the user's language,
each item naming the file it touches — plus, per item that needs one, the
drafted reply text marked `відповідь після виправлення`. `/implement-comments`
posts those once the fix lands.

State separately which disagreement replies were posted in this turn, so the
user knows what is already public.
