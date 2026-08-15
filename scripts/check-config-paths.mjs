/**
 * Verifies that the paths our tooling configs name still exist.
 *
 * `.coderabbit.yaml` shipped with `path_instructions` scoped to `src/config/**`
 * from its first commit. That directory has never existed, so the one
 * instruction about env validation and hardcoded secrets — the most
 * security-relevant line in the reviewer's config — matched no file in any
 * review it should have run in, for two months, without a single symptom.
 * Nothing could have caught it: a glob that matches nothing is valid YAML, and
 * CodeRabbit has no reason to complain about an instruction it never applies.
 *
 * The same shape of bug lives in the tsconfig `include` lists. `tsconfig.json`
 * is pinned to the application sources and `tsconfig.scripts.json` to the two
 * tooling directories, so `drizzle.config.ts` and `vitest.config.ts` — the
 * TypeScript deciding how migrations are generated and what `npm test` runs —
 * were type checked by neither. A green `npm run typecheck` said nothing about
 * them.
 *
 * Both are the failure this repository already built a check for once:
 * `check-conformance-markers.mjs` exists because prose in
 * `docs/API-CONVENTIONS.md` can go stale while every other signal stays green.
 * This is that argument applied to configuration. The invariants:
 *
 *   1. every `path:` under `reviews.path_instructions` matches a tracked file;
 *   2. every `knowledge_base.code_guidelines.filePatterns` entry matches one;
 *   3. every root-level `*.config.*` file appears in the `include` of
 *      `tsconfig.json` or `tsconfig.scripts.json`;
 *   4. the readers below still recognise their files — parsing nothing out of
 *      a config that plainly declares the key is a failure, not a pass.
 *
 * What it deliberately does NOT check: that an instruction is *right*, that a
 * pattern matches everything it should, or that CodeRabbit interprets a glob
 * the way this file does. Those need a live review to answer. This check only
 * decides the question a parser can: does anything at all sit at that path.
 *
 * Plain JavaScript rather than TypeScript, matching `check-conformance-markers.mjs`
 * and `.claude/hooks/*.cjs`: it runs from npm and from CI with no build step and
 * no `npm ci`. It is still type-checked — `tsconfig.scripts.json` runs `checkJs`
 * over this directory.
 *
 * Run locally with `npm run check:config-paths`; needs no token and no network.
 */

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const CODERABBIT = '.coderabbit.yaml';
const TSCONFIGS = ['tsconfig.json', 'tsconfig.scripts.json'];

/** Root-level configuration this repository expects to be type checked. */
const ROOT_CONFIG = /^[^/]+\.config\.(?:ts|js|mts|cts|mjs|cjs)$/u;

/**
 * Converts one glob to an anchored regular expression.
 *
 * Only the three forms our configs actually use are supported — a leading
 * `**` followed by a slash as an optional path prefix, a bare `**` as any
 * tail, and `*` as one path segment — and every other character becomes a
 * literal. A glob dialect richer than the inputs would be a second source of
 * disagreement about what a pattern means, which is the class of problem this
 * file exists to remove.
 *
 * The wildcards are parked on NUL placeholders before the escaping pass, so
 * escaping cannot mangle them and they cannot collide with anything a real
 * path contains. Longest form first: replacing `*` first would chew `**` into
 * two single-segment matchers, and `src/**` would stop matching
 * `src/routes/accounts.ts`.
 *
 * @param {string} glob - pattern as written in the config
 * @returns {RegExp} anchored matcher for a repo-relative, forward-slash path
 */
export function globToRegExp(glob) {
  const MARK = '\u0000';

  const pattern = glob
    .replace(/\*\*\//gu, `${MARK}D`)
    .replace(/\*\*/gu, `${MARK}A`)
    .replace(/\*/gu, `${MARK}S`)
    // Everything that is not one of the three wildcards is a literal, including
    // the `.` in `drizzle.config.ts` — unescaped it would also match
    // `drizzleXconfig` and report a pattern as live that names no real file.
    .replace(/[.+?^${}()|[\]\\]/gu, '\\$&')
    .split(`${MARK}D`).join('(?:.*/)?')
    .split(`${MARK}A`).join('.*')
    .split(`${MARK}S`).join('[^/]*');

  return new RegExp(`^${pattern}$`, 'u');
}

/**
 * Extracts the `path:` values under `reviews.path_instructions` and the
 * `filePatterns` list, without a YAML parser.
 *
 * Line-oriented on purpose: this script's whole value is running in CI with no
 * `npm ci`, and no YAML reader ships with Node. The narrowness is the risk — a
 * config rewritten in flow style (`path_instructions: [{path: ...}]`) would
 * read as empty — so `run` treats "declared the key, parsed nothing" as a
 * failure rather than a pass, the same defence `check-conformance-markers.mjs`
 * uses against its own parser drifting away from its document.
 *
 * Comments are stripped, not skipped by prefix. Both forms have to go: the
 * whole-line kind, because this config documents its own history and the
 * `# - path: "src/config/**"` tombstone in it must not be checked as though it
 * were live; and the trailing kind, because an anchored match against a line
 * ending in ` # TODO` fails outright, which silently removes that pattern from
 * the check instead of checking it — the script's own failure mode, aimed at
 * the script. Annotating an entry is the likeliest edit this file will ever
 * see, so it must not be the one that disarms the guard.
 *
 * @param {string} source - full text of `.coderabbit.yaml`
 * @returns {{ instructions: string[], filePatterns: string[], guidelinesEnabled: boolean|null }}
 *   patterns in the order they appear, and whether `code_guidelines.enabled`
 *   was found set — `null` when the key is absent entirely
 */
export function parseCodeRabbit(source) {
  /** @type {string[]} */
  const instructions = [];
  /** @type {string[]} */
  const filePatterns = [];
  let inFilePatterns = false;

  // `enabled` is a common key name in this config format, so it counts only
  // inside the `code_guidelines` block. Indentation is what delimits that
  // block: any later line indented no further than the key itself has left it.
  let guidelinesIndent = -1;
  /** @type {boolean|null} */
  let guidelinesEnabled = null;

  for (const raw of source.split(/\r?\n/u)) {
    // A whole-line comment reduces to '', which the list-termination check
    // below deliberately treats as "keep going" — so a comment sitting inside
    // the filePatterns list does not end it.
    const stripped = stripComment(raw);
    const line = stripped.trim();
    // Blank lines carry no indentation to compare, so they close nothing.
    const indent = line === '' ? -1 : stripped.length - stripped.trimStart().length;

    if (guidelinesIndent >= 0 && indent >= 0 && indent <= guidelinesIndent) {
      guidelinesIndent = -1;
    }

    if (/^code_guidelines:\s*$/u.test(line)) {
      guidelinesIndent = indent;
      continue;
    }

    if (guidelinesIndent >= 0) {
      const enabled = line.match(/^enabled:\s*(true|false)\s*$/u);
      if (enabled) guidelinesEnabled = enabled[1] === 'true';
    }

    const instruction = line.match(/^-\s*path:\s*["']?([^"']+?)["']?\s*$/u);
    if (instruction?.[1]) {
      instructions.push(instruction[1]);
      inFilePatterns = false;
      continue;
    }

    if (/^filePatterns:\s*$/u.test(line)) {
      inFilePatterns = true;
      continue;
    }

    if (inFilePatterns) {
      const item = line.match(/^-\s*["']?([^"']+?)["']?\s*$/u);
      if (item?.[1]) {
        filePatterns.push(item[1]);
        continue;
      }
      // Any other non-empty line ends the list. A blank line does not, so a
      // list separated from its key by whitespace still reads correctly.
      if (line !== '') inFilePatterns = false;
    }
  }

  return { instructions, filePatterns, guidelinesEnabled };
}

/**
 * Removes a YAML comment from one line, leaving quoted text alone.
 *
 * YAML only starts a trailing comment at a `#` that follows whitespace or
 * opens the line, which is what makes this decidable without a parser: a `#`
 * anywhere else is an ordinary character. Quote state is tracked so a `#`
 * inside a quoted path stays part of the value rather than truncating it.
 *
 * @param {string} line - one raw line
 * @returns {string} the line with any comment removed
 */
function stripComment(line) {
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === '"' && !inSingle) inDouble = !inDouble;
    else if (
      char === '#' &&
      !inSingle &&
      !inDouble &&
      (index === 0 || /\s/u.test(line[index - 1] ?? ''))
    ) {
      return line.slice(0, index);
    }
  }

  return line;
}

/**
 * Reads the `include` array of a tsconfig.
 *
 * Both configs carry block comments — that is how this repository explains its
 * tooling — so the text is stripped of comments before `JSON.parse`. Quoted
 * runs are consumed whole rather than scanned, because stripping naively would
 * corrupt any path containing `//`.
 *
 * @param {string} source - full text of a tsconfig
 * @returns {string[]} the `include` entries, empty when the key is absent
 */
export function parseTsconfigInclude(source) {
  let out = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index] ?? '';

    if (char === '"') {
      const closing = source.indexOf('"', index + 1);
      // An unterminated string would otherwise consume the rest of the file and
      // surface as a JSON error pointing at entirely the wrong position.
      if (closing === -1) break;
      out += source.slice(index, closing + 1);
      index = closing + 1;
      continue;
    }

    if (char === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index);
      index = newline === -1 ? source.length : newline;
      continue;
    }

    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    out += char;
    index += 1;
  }

  const parsed = /** @type {{ include?: unknown }} */ (JSON.parse(out));
  return Array.isArray(parsed.include)
    ? parsed.include.filter((entry) => typeof entry === 'string')
    : [];
}

/**
 * Every file the repository contains, as repo-relative forward-slash paths.
 *
 * `git ls-files` rather than a directory walk: it already honours
 * `.gitignore`, so `node_modules/` and `dist/` cost nothing.
 *
 * `--others --exclude-standard` alongside the default `--cached`, because the
 * index alone answers a subtly different question. A developer who has just
 * written `playwright.config.ts` and not yet staged it would otherwise be told
 * every root config is type checked — the one file the check exists to catch
 * being the one file it cannot see. CI is unaffected either way; what changes
 * is that the local run stops disagreeing with the one that gates the merge.
 *
 * `-z` is what makes the output trustworthy. Without it `git ls-files` applies
 * `core.quotepath`, which defaults to on and renders any non-ASCII path as a
 * C-escaped, double-quoted string: `docs/Конвенції.md` comes back as
 * `"docs/\320\232..."`, matches no pattern, and gets reported as a file that
 * does not exist. In a repository whose entire `docs/` tree is Ukrainian that
 * is a matter of time, not of chance. NUL separation also settles the
 * newline-in-a-filename case, which no line split can.
 *
 * @returns {string[]} repo-relative paths, deduplicated
 */
export function repoFiles() {
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  );

  return [...new Set(listed.split('\u0000').filter((entry) => entry !== ''))];
}

/**
 * Runs the check and reports. Every failure — including an unreadable config
 * and running outside a work tree — goes through `report`, so none of them
 * reaches the user as an uncaught stack trace.
 *
 * @returns {Promise<void>} resolves once the outcome has been printed
 */
export async function run() {
  /** @type {string[]} */
  const problems = [];

  /** @type {string[]} */
  let files;
  try {
    files = repoFiles();
  } catch (cause) {
    return report(
      [`cannot list repository files (${formatCause(cause)}) — run this from inside the work tree`],
      0,
    );
  }

  /** @type {string} */
  let yaml;
  try {
    yaml = await readFile(CODERABBIT, 'utf8');
  } catch (cause) {
    return report(
      [
        `cannot read ${CODERABBIT} (${formatCause(cause)}) — paths are resolved from the ` +
        'repository root, so run this through `npm run check:config-paths`',
      ],
      0,
    );
  }

  const { instructions, filePatterns, guidelinesEnabled } = parseCodeRabbit(yaml);

  // The reader is line-oriented and narrow by design; a config it no longer
  // recognises would otherwise pass forever while checking nothing.
  if (instructions.length === 0) {
    return report(
      [`parsed 0 path instructions from ${CODERABBIT} — the reader and the file have diverged`],
      0,
    );
  }

  // Presence, not just correctness. An earlier revision only complained when
  // the key was declared and unreadable, which left the whole thing removable
  // in silence: delete the `knowledge_base` block and every remaining pattern
  // still resolved, so the run passed while docs/API-CONVENTIONS.md went back
  // to being invisible to the only reviewer that reads every pull request —
  // the exact two-month failure this script was written for, re-entering
  // through the door the script itself left open.
  if (filePatterns.length === 0) {
    problems.push(
      `${CODERABBIT} lists no code_guidelines.filePatterns — docs/API-CONVENTIONS.md matches ` +
      'none of the patterns CodeRabbit looks for on its own, so the binding contract is ' +
      'invisible to it without this key (or the reader has diverged from the file)',
    );
  }

  // Whether CodeRabbit honours `enabled` cannot be settled statically — the
  // documentation and the published schema disagree on its default, which is
  // why it is set explicitly and why docs/PROGRESS.md carries an open item to
  // confirm it on a live review. That it is still *there* is decidable, and is
  // the half worth gating.
  if (guidelinesEnabled !== true) {
    problems.push(
      `${CODERABBIT} does not set code_guidelines.enabled: true — it is written explicitly ` +
      'because the documented default and the published schema disagree, so dropping it ' +
      'silently risks turning the guideline scan off',
    );
  }

  for (const [label, patterns] of /** @type {[string, string[]][]} */ ([
    ['path_instructions', instructions],
    ['knowledge_base.code_guidelines.filePatterns', filePatterns],
  ])) {
    for (const pattern of patterns) {
      const matcher = globToRegExp(pattern);
      if (!files.some((file) => matcher.test(file))) {
        problems.push(`${CODERABBIT} → ${label}: "${pattern}" matches no tracked file`);
      }
    }
  }

  /** @type {string[]} */
  const covered = [];
  // Reading and parsing are reported separately: a trailing comma in an
  // `include` array is a perfectly readable file that JSON.parse rejects, and
  // calling that "cannot read" sends the operator looking for the wrong thing.
  let tsconfigsIntact = true;

  for (const config of TSCONFIGS) {
    /** @type {string} */
    let text;
    try {
      text = await readFile(config, 'utf8');
    } catch (cause) {
      problems.push(`cannot read ${config} (${formatCause(cause)})`);
      tsconfigsIntact = false;
      continue;
    }

    try {
      covered.push(...parseTsconfigInclude(text));
    } catch (cause) {
      problems.push(
        `${config} is not parseable as JSON-with-comments (${formatCause(cause)}) — ` +
        'a trailing comma in `include` is the usual cause',
      );
      tsconfigsIntact = false;
    }
  }

  // Only meaningful when every config was understood. Run it against a partial
  // include set and a file listed in the config that failed would be reported
  // as escaping typecheck — a second, false complaint about the first one.
  if (!tsconfigsIntact) {
    return report(problems, instructions.length + filePatterns.length);
  }

  if (covered.length === 0) {
    problems.push(
      `parsed 0 include entries from ${TSCONFIGS.join(' and ')} — the reader and the files have diverged`,
    );
    return report(problems, instructions.length + filePatterns.length);
  }

  const includeMatchers = covered.map(globToRegExp);
  for (const file of files.filter((candidate) => ROOT_CONFIG.test(candidate))) {
    if (!includeMatchers.some((matcher) => matcher.test(file))) {
      problems.push(
        `${file} is in no tsconfig \`include\` — it is never type checked. Add it to ` +
        'tsconfig.scripts.json, which already covers repository tooling',
      );
    }
  }

  return report(problems, instructions.length + filePatterns.length);
}

/**
 * Renders a thrown value as a one-line cause. `catch` binds `unknown`, and a
 * non-Error throw would otherwise print as `undefined` and destroy the only
 * diagnostic the operator had.
 *
 * Identical to the copy in `check-conformance-markers.mjs`, and deliberately
 * not shared — see docs/DECISIONS.md → "Перевірка шляхів у конфігах тулінгу",
 * which names the third check script as the trigger for extracting it.
 *
 * @param {unknown} cause - whatever was thrown
 * @returns {string} a printable description
 */
function formatCause(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Prints the outcome. The success line is printed **only** on success.
 *
 * @param {string[]} problems - everything wrong, empty when the check passes
 * @param {number} checked - how many patterns were resolved
 * @returns {void}
 */
function report(problems, checked) {
  if (problems.length === 0) {
    console.log(
      `${CODERABBIT}: ${checked} patterns checked, all match tracked files; ` +
      'every root config is type checked.',
    );
    return;
  }

  console.error('Tooling config names paths that do not exist:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nA pattern that matches nothing is silently ignored by the tool it configures.');
  // `exitCode`, not `exit(1)`: exiting outright tears the process down while
  // stderr is still draining and aborts with a libuv assertion on Windows.
  process.exitCode = 1;
}

// Only when executed directly, so the readers above can be imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
