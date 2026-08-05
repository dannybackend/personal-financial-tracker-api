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
 * - output: JSON on stdout with hookSpecificOutput.additionalContext reaches
 *   the agent. Plain text does NOT - it only lands in the debug log, so a bare
 *   console.log here would look like it works while saying nothing.
 * - always exit 0: this hook informs, it never blocks an edit.
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
 * True when `file` is not yet tracked by git, i.e. the edit just created it.
 * Used so route reminders fire once per new module rather than on every edit -
 * a reminder that appears twenty times per feature stops being read.
 */
function isNewFile(file) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', file], {
      stdio: 'ignore',
      cwd: path.dirname(file) || '.',
    });
    return false;
  } catch {
    return true;
  }
}

/**
 * Maps an edited file to the documentation rules it triggers.
 * Returns null when nothing applies - the overwhelmingly common case.
 */
function rulesFor(relPath, absPath) {
  const p = relPath.replace(/\\/g, '/');

  if (p === 'src/db/schema.ts') {
    return [
      'Schema changed. AGENTS.md rules that apply now:',
      '- generate the migration (`npm run db:generate`) - schema edits without one drift silently',
      '- if this involved a trade-off between viable approaches, append an entry to docs/DECISIONS.md (append only; corrections go in as a new "Уточнення" entry)',
      '- keep the Mermaid ERD in step with the tables you changed',
      '- docs/API-CONVENTIONS.md §5-§7 bind money, currency and date columns',
    ];
  }

  if (/^src\/db\/migrations\/.+\.(sql|ts)$/.test(p) && isNewFile(absPath)) {
    return [
      'New migration. If it introduces a backend concept for the first time in',
      'this project (indexes, constraints, transactions, soft delete...), append',
      'a short entry to docs/LEARNING.md in the format that file documents.',
    ];
  }

  if (/^src\/routes\/[^/]+\.ts$/.test(p) && !p.endsWith('.test.ts') && isNewFile(absPath)) {
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

  const cwd = input.cwd || process.cwd();
  const rel = path.relative(cwd, path.resolve(cwd, filePath));
  const rules = rulesFor(rel, path.resolve(cwd, filePath));
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
