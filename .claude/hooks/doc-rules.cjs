#!/usr/bin/env node
/**
 * PostToolUse hook: reminds about the documentation rules in AGENTS.md at the
 * moment they apply, instead of relying on the agent having remembered them.
 *
 * Why this exists: the "When you..." rules were kept by discipline alone, and
 * discipline drifted twice - docs/ONBOARDING.md claimed the accounts endpoints
 * did not exist months after they shipped, and README.md described a data model
 * this project rejected in its first architectural decision. A rule the agent
 * may not have read is weaker than a trigger that always fires.
 *
 * Contract (see https://code.claude.com/docs/en/hooks):
 * - input: JSON on stdin, `tool_input.file_path` is the edited file
 * - output: JSON on stdout, where hookSpecificOutput.additionalContext adds a
 *   reminder to the agent's context. Plain text on stdout is written to the
 *   debug log and for most events does not reach the transcript, so a bare
 *   console.log here would look like it works while saying nothing.
 * - always exit 0: this hook informs, it never blocks an edit.
 *
 * All paths are resolved against the git root, never the session's working
 * directory: a session started in a subdirectory would otherwise compute the
 * wrong relative path and every rule would silently stop matching.
 *
 * Node rather than shell + jq: the team is on Windows, and jq is not installed
 * by default. Node is already a hard dependency of this project.
 */

const { execFileSync } = require('child_process');
const path = require('path');

/** Reads the whole of stdin. Returns '' when the hook is run with no input. */
function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Absolute path of the repository root, or null outside a work tree.
 * Resolved from the edited file's own directory so it is correct no matter
 * where the session was started.
 */
function repoRoot(fromDir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: fromDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * True when `relPath` is not yet tracked by git.
 *
 * Untracked alone is NOT enough to mean "just created": a new file stays
 * untracked until `git add`, so every subsequent edit would re-trigger. The
 * caller pairs this with `tool_name === 'Write'`, which is the tool that
 * creates a file; later modifications arrive as `Edit`.
 *
 * `--` separates the pathspec from options so a path that starts with a dash
 * is never parsed as one.
 */
function isNewFile(root, relPath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relPath], {
      cwd: root,
      stdio: 'ignore',
    });
    return false;
  } catch {
    return true;
  }
}

/**
 * True when `absPath` could match a rule at all, judged on the path alone.
 *
 * Checked before the git root is resolved, because resolving it costs a
 * synchronous `git rev-parse` and almost every edit in a session matches no
 * rule. Deliberately loose - it only has to be cheap and never reject a path
 * `rulesFor` would have accepted; `rulesFor` still decides.
 */
function mayMatch(absPath) {
  const p = absPath.split(path.sep).join('/');
  return (
    /\/src\/db\/(auth-)?schema\.ts$/.test(p) || p.includes('/src/routes/')
  );
}

/**
 * Maps an edited file to the documentation rules it triggers.
 * Returns null when nothing applies - the overwhelmingly common case.
 */
function rulesFor(p, root, isCreate) {
  // Both files are listed as schema sources in drizzle.config.ts, so either
  // one changing means a migration is owed.
  if (p === 'src/db/schema.ts' || p === 'src/db/auth-schema.ts') {
    return [
      'Schema changed. AGENTS.md rules that apply now:',
      '- generate the migration (`npm run db:generate`) - schema edits without one drift silently',
      '- if the migration introduces a backend concept for the first time in this project (indexes, constraints, transactions, soft delete...), append an entry to docs/LEARNING.md',
      '- if this involved a trade-off between viable approaches, append an entry to docs/DECISIONS.md (append only; corrections go in as a new "Уточнення" entry)',
      '- keep the Mermaid ERD in step with the tables you changed - it exists in BOTH README.md and README.uk.md, which never diverge',
      '- docs/API-CONVENTIONS.md §5-§7 bind money, currency and date columns',
    ];
  }

  // No trigger on src/db/migrations/: drizzle-kit writes those files itself
  // through Bash, so a Write|Edit hook never sees them. The LEARNING.md
  // reminder is folded into the schema rule above, which fires one step
  // earlier - at the edit that makes the migration necessary.

  if (
    isCreate &&
    /^src\/routes\/[^/]+\.ts$/.test(p) &&
    !p.endsWith('.test.ts') &&
    isNewFile(root, p)
  ) {
    return [
      'New route module. AGENTS.md rules that apply now:',
      '- add the matching requests to api.http so it stays a runnable map of the API',
      '- every new endpoint needs at least one integration test (src/routes/<name>.test.ts)',
      '- handler order incl. the ownership check: docs/API-CONVENTIONS.md §1-§2',
      '- if this is a domain entity shipping its first endpoint, update the Status and',
      '  API surface sections of BOTH README.md and README.uk.md',
    ];
  }

  return null;
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) return;

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // Malformed input is not this hook's problem to report.
  }

  const filePath = input && input.tool_input && input.tool_input.file_path;
  if (!filePath) return;

  // file_path may be absolute or relative to the session cwd; either way the
  // rules are matched against a path relative to the git root.
  const abs = path.resolve(input.cwd || process.cwd(), filePath);
  if (!mayMatch(abs)) return; // Cheap reject first - no subprocess for ordinary edits.

  const root = repoRoot(path.dirname(abs));
  if (!root) return; // Outside a work tree there is nothing to remind about.

  const rel = path.relative(root, abs).split(path.sep).join('/');
  const rules = rulesFor(rel, root, input.tool_name === 'Write');
  if (!rules) return; // Silence is the default. Noise is how reminders die.

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: rules.join('\n'),
      },
    }),
  );
}

main();
