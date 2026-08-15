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
    .replace(/\?/gu, `${MARK}Q`)
    // Everything that is not one of the four wildcards is a literal, including
    // the `.` in `drizzle.config.ts` — unescaped it would also match
    // `drizzleXconfig` and report a pattern as live that names no real file.
    .replace(/[.+?^${}()|[\]\\]/gu, '\\$&')
    .split(`${MARK}D`).join('(?:.*/)?')
    .split(`${MARK}A`).join('.*')
    .split(`${MARK}S`).join('[^/]*')
    .split(`${MARK}Q`).join('[^/]');

  return new RegExp(`^${pattern}$`, 'u');
}

/**
 * Strips a leading `./` from a repo-relative path or pattern.
 *
 * `./drizzle.config.ts` and `drizzle.config.ts` name the same file to
 * TypeScript, and a `files` array is commonly written the first way, but a
 * string comparison between the two forms calls them different — which
 * reported a root config as never type checked while `tsc` was compiling it.
 *
 * @param {string} value - path or glob as written in a config
 * @returns {string} the same value without a `./` prefix
 */
function withoutDotSlash(value) {
  return value.startsWith('./') ? value.slice(2) : value;
}

/**
 * Converts one tsconfig `include`/`exclude` pattern to a matcher.
 *
 * TypeScript's dialect is not the one `globToRegExp` implements on its own: a
 * pattern carrying no wildcard and no extension names a **directory** and
 * matches everything beneath it, so `"exclude": ["dist"]` removes
 * `dist/x.ts`. Read as a literal filename it matched nothing, and a normally
 * written config looked as though it covered no root file at all.
 *
 * Kept separate from `globToRegExp` rather than folded into it, because the
 * same directory-shaped pattern in `.coderabbit.yaml` means the literal path
 * and nothing more — one function answering to two dialects is how a matcher
 * starts quietly disagreeing with both.
 *
 * @param {string} pattern - an entry from `include` or `exclude`
 * @returns {RegExp} anchored matcher for a repo-relative path
 */
function tsconfigGlobToRegExp(pattern) {
  const normalised = withoutDotSlash(pattern).replace(/\/+$/u, '');
  const lastSegment = normalised.slice(normalised.lastIndexOf('/') + 1);

  // `.` is the project root written as a directory, and `""` is what `./`
  // reduces to here. Both mean the whole tree, and neither survives the
  // "does the last segment carry an extension" test that decides the rest:
  // `.` is all dot and would read as a file with no name.
  const isWholeTree = normalised === '' || /^\.+$/u.test(lastSegment);
  const isDirectory = !/[*?]/u.test(normalised) && (isWholeTree || !lastSegment.includes('.'));

  if (!isDirectory) return globToRegExp(normalised);
  return globToRegExp(isWholeTree ? '**' : `${normalised}/**`);
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

  // Same tracking for `path_instructions`, because `- path:` is not unique to
  // it — CodeRabbit's format uses the same item shape elsewhere, and a list
  // under another key would otherwise be checked as though somebody had
  // written it as a review instruction.
  let instructionsIndent = -1;

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
    // A `-` item belongs to the block at the key's own indentation as well as
    // deeper: YAML allows a sequence to sit level with its key, and it is a
    // common house style. Treating "level with" as "outside" made every
    // instruction invisible in a file that is valid and means exactly the same
    // thing — a red build over formatting. Only a mapping line at or above the
    // key ends the block.
    const isItem = line.startsWith('-');
    const leftInstructions = isItem ? indent < instructionsIndent : indent <= instructionsIndent;
    if (instructionsIndent >= 0 && indent >= 0 && leftInstructions) {
      instructionsIndent = -1;
    }

    if (/^code_guidelines:\s*$/u.test(line)) {
      guidelinesIndent = indent;
      continue;
    }

    if (/^path_instructions:\s*$/u.test(line)) {
      instructionsIndent = indent;
      continue;
    }

    if (guidelinesIndent >= 0) {
      const enabled = line.match(/^enabled:\s*(true|false)\s*$/u);
      if (enabled) guidelinesEnabled = enabled[1] === 'true';
    }

    const instruction = instructionsIndent >= 0
      ? line.match(/^-\s*path:\s*["']?([^"']+?)["']?\s*$/u)
      : null;
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
 * Reads the three path keys of a tsconfig: `include`, `files` and `exclude`.
 *
 * All three are needed to answer "is this file type checked", and reading only
 * `include` got it wrong in the direction that matters: `exclude` filters what
 * `include` found, so a config listed in `include` and then excluded is not
 * compiled at all while a check reading `include` alone calls it covered —
 * silence, which is the one outcome this script exists to prevent. `files` is
 * the opposite error: an explicit list that `exclude` deliberately does not
 * filter, so a config named only there would be reported as escaping typecheck
 * when it does not.
 *
 * Both configs carry block comments — that is how this repository explains its
 * tooling — so comments go before `JSON.parse`, with quoted runs consumed whole
 * because stripping naively would corrupt any path containing `//`. Trailing
 * commas go for the same reason: `tsc` reads these files as JSONC and accepts
 * them (verified against the pinned compiler), so rejecting one would fail the
 * build over a config TypeScript itself is perfectly happy with.
 *
 * @param {string} source - full text of a tsconfig
 * @returns {{ include: string[], files: string[], exclude: string[] }} each
 *   key's string entries, empty where the key is absent
 */
export function parseTsconfigPaths(source) {
  const parsed = /** @type {Record<string, unknown>} */ (
    JSON.parse(stripTrailingCommas(stripJsonComments(source)))
  );

  /** @param {string} key @returns {string[]} */
  const strings = (key) => {
    const value = parsed[key];
    return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
  };

  return { include: strings('include'), files: strings('files'), exclude: strings('exclude') };
}

/**
 * Removes `//` and block comments, leaving string contents untouched.
 *
 * @param {string} source - JSONC text
 * @returns {string} the same text with comments elided
 */
function stripJsonComments(source) {
  let out = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index] ?? '';

    if (char === '"') {
      const closing = endOfString(source, index);
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

  return out;
}

/**
 * Removes commas that sit before a closing brace or bracket.
 *
 * A second walk rather than a regular expression over the whole text: `,` and
 * `}` can both appear inside a legitimate path string, and a bare
 * `/,(?=\s*[}\]])/` would reach into `"a,}"` and change the value it was only
 * supposed to punctuate.
 *
 * @param {string} json - JSON text with comments already removed
 * @returns {string} the same text with trailing commas elided
 */
function stripTrailingCommas(json) {
  let out = '';
  let index = 0;

  while (index < json.length) {
    const char = json[index] ?? '';

    if (char === '"') {
      const closing = endOfString(json, index);
      if (closing === -1) break;
      out += json.slice(index, closing + 1);
      index = closing + 1;
      continue;
    }

    if (char === ',') {
      // Scanned with an index rather than `json.slice(index + 1).trimStart()`,
      // which copied the whole remaining document once per comma to look at a
      // single character.
      let lookahead = index + 1;
      while (lookahead < json.length && /\s/u.test(json[lookahead] ?? '')) lookahead += 1;

      const next = json[lookahead];
      if (next === '}' || next === ']') {
        index += 1;
        continue;
      }
    }

    out += char;
    index += 1;
  }

  return out;
}

/**
 * Index of the closing quote of the JSON string starting at `start`.
 *
 * `indexOf('"')` was wrong for both walkers above: it stops at a
 * backslash-escaped quote inside the value, after which the rest of that
 * string is scanned as though it were structure — a `//` in it elided as a
 * comment, a comma before `}` removed from inside a path.
 *
 * @param {string} text - JSON text
 * @param {number} start - index of the opening quote
 * @returns {number} index of the closing quote, or -1 when unterminated
 */
function endOfString(text, start) {
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '"') return index;
  }

  return -1;
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

  /** @type {{ include: string[], files: string[], exclude: string[] }[]} */
  const tsconfigs = [];
  // Reading and parsing are reported separately: a malformed `include` array is
  // a perfectly readable file that JSON.parse rejects, and calling that "cannot
  // read" sends the operator looking for the wrong thing.
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
      tsconfigs.push(parseTsconfigPaths(text));
    } catch (cause) {
      problems.push(
        `${config} is not parseable as JSON-with-comments (${formatCause(cause)})`,
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

  if (tsconfigs.every((config) => config.include.length + config.files.length === 0)) {
    problems.push(
      `parsed no include or files entries from ${TSCONFIGS.join(' and ')} — the reader and the files have diverged`,
    );
    return report(problems, instructions.length + filePatterns.length);
  }

  // TypeScript's precedence between the three keys, which is where the
  // asymmetry lives: `exclude` filters what `include` found and does not touch
  // `files`, so a path named in `files` stays in the program however the
  // exclusions read. The glob dialect is `tsconfigGlobToRegExp`'s business.
  const compiled = tsconfigs.map((config) => ({
    files: new Set(config.files.map(withoutDotSlash)),
    include: config.include.map(tsconfigGlobToRegExp),
    exclude: config.exclude.map(tsconfigGlobToRegExp),
  }));

  for (const file of files.filter((candidate) => ROOT_CONFIG.test(candidate))) {
    const covered = compiled.some(
      (config) =>
        config.files.has(file) ||
        (config.include.some((matcher) => matcher.test(file)) &&
          !config.exclude.some((matcher) => matcher.test(file))),
    );

    if (!covered) {
      problems.push(
        `${file} is in no tsconfig program — it is never type checked. Add it to ` +
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
