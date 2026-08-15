/**
 * Two things about this hook were checked by hand and by nothing else.
 *
 * **What its reminders name.** Every reminder names real artifacts - files to
 * update, npm scripts to run - and those names were verified by no one:
 * eslint saw syntactically perfect string literals, `npm test` covered the
 * application only, and running the hook proved it fires and prints something,
 * never that what it prints is true. That gap is how '- keep the Mermaid ERD in
 * step with the tables you changed' survived from the hook's first commit
 * (d349e48) until issue #76, pointing at a diagram neither README has ever
 * contained. It fired correctly every single time.
 *
 * **What it actually does.** Which paths trigger it, when it stays silent, and
 * the shape of what it writes. Its own header warns that a hook printing plain
 * text instead of `hookSpecificOutput` "would look like it works while saying
 * nothing" - a failure no assertion existed to catch.
 *
 * Reference scope is the reminder lines only, not the whole file: comments are
 * written for whoever edits this hook and may name things loosely
 * (`settings.json`, `doc-rules.cjs`), while every path inside a reminder is an
 * instruction the agent will act on.
 *
 * Deliberately NOT covered: the section headings quoted inside the reminders
 * ("Data model" / "Модель даних"). Telling a heading from an ordinary quoted
 * phrase - "Уточнення" in the DECISIONS reminder is not a heading - needs the
 * hook's text restructured into data first. A fuzzy check that fails on
 * innocent wording would be worse than no check: it gets muted, and then it
 * protects nothing while looking like it does.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const hookUrl = new URL('./doc-rules.cjs', import.meta.url);
const repoRootUrl = new URL('../../', import.meta.url);
const hookPath = fileURLToPath(hookUrl);
const repoRoot = fileURLToPath(repoRootUrl);
const source = readFileSync(hookUrl, 'utf8');

/**
 * The reminder strings, one per line in this hook, each a quoted array entry.
 * Matching whole lines rather than quotes keeps apostrophes in prose comments
 * ("this reminder's business") from opening a spurious string match.
 */
function reminderLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith("'") && line.endsWith("',"));
}

const reminders = reminderLines(source);
const remindersText = reminders.join('\n');

/**
 * Removes placeholders like `src/routes/<name>.test.ts`, which describe a shape
 * rather than name a file. The whole run has to go: matching only the token
 * would leave the tail `test.ts` behind and report it as a missing file.
 */
const stripPlaceholders = (text) => text.replace(/[\w./-]*<[^>]*>[\w./-]*/g, ' ');

function referencedPaths(text) {
  const matches =
    stripPlaceholders(text).match(/[\w][\w./-]*\.(?:md|ts|mjs|cjs|http|json|yml)/g) ?? [];
  return [...new Set(matches)];
}

function referencedNpmScripts(text) {
  return [...new Set([...text.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]))];
}

const paths = referencedPaths(remindersText);
const npmScripts = referencedNpmScripts(remindersText);
const packageJson = JSON.parse(readFileSync(new URL('package.json', repoRootUrl), 'utf8'));

/** Runs the hook exactly as Claude Code does: JSON on stdin, JSON on stdout. */
function runHook(payload) {
  return execFileSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

const edit = (file_path) => ({ cwd: repoRoot, tool_name: 'Edit', tool_input: { file_path } });
const write = (file_path) => ({ cwd: repoRoot, tool_name: 'Write', tool_input: { file_path } });

describe('doc-rules reminders name real things', () => {
  // Without this, an edit that stops a reminder from being extracted turns its
  // check into a silent pass. Comparing counts is not enough: dropping the
  // trailing comma of one entry lowers the captured total while still clearing
  // any threshold, and that entry's paths quietly stop being verified.
  it('extracts every reminder line, not merely some of them', () => {
    const looksLikeReminder = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith("'- "));
    const captured = new Set(reminders);

    expect(
      looksLikeReminder.length,
      'no reminder lines found at all - has the hook been restructured?',
    ).toBeGreaterThan(0);
    expect(
      looksLikeReminder.filter((line) => !captured.has(line)),
      'these reminders were skipped by the extractor, so nothing checks what they name',
    ).toEqual([]);
  });

  it.each(paths)('reminder path %s exists', (relPath) => {
    expect(
      () => readFileSync(new URL(relPath, repoRootUrl), 'utf8'),
      `the hook tells the agent to update "${relPath}", which is not in the repository`,
    ).not.toThrow();
  });

  it.each(npmScripts)('reminder command npm run %s is defined', (script) => {
    expect(
      Object.keys(packageJson.scripts),
      `the hook tells the agent to run "npm run ${script}", which package.json does not define`,
    ).toContain(script);
  });
});

describe('doc-rules fires where it should', () => {
  it.each(['src/db/schema.ts', 'src/db/auth-schema.ts'])('reminds on %s', (file) => {
    const parsed = JSON.parse(runHook(edit(file)));

    // The shape Claude Code reads. Plain stdout would be written to the debug
    // log instead, leaving the hook mute while looking healthy.
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Schema changed.');
  });

  it('reminds when a route module is created', () => {
    const parsed = JSON.parse(runHook(write('src/routes/categories.ts')));

    expect(parsed.hookSpecificOutput.additionalContext).toContain('New route module.');
  });

  it('accepts an absolute file_path as well as one relative to cwd', () => {
    const absolute = fileURLToPath(new URL('src/db/schema.ts', repoRootUrl));

    expect(JSON.parse(runHook(edit(absolute))).hookSpecificOutput.additionalContext).toContain(
      'Schema changed.',
    );
  });
});

describe('doc-rules stays silent everywhere else', () => {
  it.each([
    ['an ordinary edit to an existing route', edit('src/routes/accounts.ts')],
    ['a file no rule covers', edit('README.md')],
    ['a route test file being created', write('src/routes/newly-added.test.ts')],
    ['a route module that git already tracks', write('src/routes/accounts.ts')],
    ['an event carrying no file_path', { cwd: repoRoot, tool_name: 'Edit', tool_input: {} }],
  ])('says nothing on %s', (_case, payload) => {
    // Silence is the default; noise is how reminders die. A rule that starts
    // firing on every edit is as broken as one that never fires.
    expect(runHook(payload)).toBe('');
  });

  it('survives malformed input without failing the tool call', () => {
    // execFileSync throws on a non-zero exit, so this also pins "always exit 0":
    // this hook informs, it never blocks an edit.
    const stdout = execFileSync(process.execPath, [hookPath], {
      input: 'not json at all',
      encoding: 'utf8',
    });

    expect(stdout).toBe('');
  });
});
