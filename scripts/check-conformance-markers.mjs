/**
 * Verifies the conformance markers in docs/API-CONVENTIONS.md against reality.
 *
 * The markers claim whether shipped code satisfies each section. That claim is
 * prose, so nothing in the normal pipeline can contradict it — typecheck, lint
 * and the test suite all stay green while the file says something false. This
 * script is the one check that can, and it enforces the invariants a parser is
 * actually able to decide:
 *
 *   1. every numbered section opens with a marker in a form the legend defines;
 *   2. every issue named in a `🔧 debt` marker is still open — a closed one
 *      means the work landed and the marker was never flipped;
 *   3. the parser still recognises the document — no numbered sections found,
 *      or an unterminated code fence swallowing the rest of the file, is a
 *      failure and not a pass.
 *
 * What it deliberately does NOT check: that a `✅` is still true. No static
 * check knows a new route module broke §2, and a `✅` may legitimately cite an
 * open issue for an adjacent gap. That direction stays with review.
 *
 * Plain JavaScript rather than TypeScript, matching `.claude/hooks/*.cjs`: it
 * runs from `npm` and from CI with no build step and no `npm ci`. It is still
 * type-checked — `tsconfig.scripts.json` runs `checkJs` over this directory,
 * and `npm run typecheck` covers both configs.
 *
 * Run locally with `npm run check:markers`; needs a token, see docs/ONBOARDING.md.
 */

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { formatCause, markFailed } from './lib/report.mjs';

const DEFAULT_DOC_PATH = 'docs/API-CONVENTIONS.md';

/** One GraphQL round trip; generous for an API call, short of a hung job. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The marker forms the legend defines. Anything else at the top of a section
 * is a marker nobody agreed on, and this script would rather fail than guess.
 */
const MARKER = /^(?:✅ \*\*holds(?:, vacuously)?\*\*|🔧 \*\*debt ((?:#\d+)(?:,\s*#\d+)*)\*\*)/u;

/**
 * A blockquote opening with either glyph is claiming to be a marker. Anything
 * that leads this way but fails `MARKER` is the second way this parser can
 * quietly stop working: only the 🔧 branch carries a capture group, so a
 * regression confined to that group leaves every section matching, no
 * structural complaint, an empty `debts`, and a clean exit.
 */
const MARKER_LEAD = /^(?:✅|🔧)/u;
const NUMBERED_SECTION = /^## \d+\./u;
const ANY_HEADING = /^#{2,3} /u;
const FENCE = /^\s*```/u;

/**
 * Joins one contiguous blockquote run into a single string with the `> `
 * prefixes stripped.
 *
 * Markers are matched against the joined run rather than a single line
 * because the document wraps at 80 columns: a marker naming five or six
 * issues will eventually be wrapped after a comma, and a line-at-a-time match
 * would then report the section as having no marker at all — pointing the
 * author at entirely the wrong problem.
 *
 * @param {string[]} lines - the document split into lines
 * @param {number} start - index to begin at
 * @returns {{ text: string, end: number }} joined quote text, and the index of
 *   the first line after the run
 */
function joinBlockquote(lines, start) {
  /** @type {string[]} */
  const parts = [];
  let cursor = start;

  while ((lines[cursor] ?? '').startsWith('>')) {
    parts.push((lines[cursor] ?? '').replace(/^>\s?/u, ''));
    cursor += 1;
  }

  return { text: parts.join(' '), end: cursor };
}

/**
 * Parses the document into the debt markers it declares, and reports every way
 * the document and this parser can have drifted apart.
 *
 * @param {string} source - full text of the conventions document
 * @returns {{ debts: Map<number, Set<string>>, structural: string[], numberedSections: number }}
 *   issue numbers mapped to the headings citing them, structural complaints,
 *   and how many numbered sections were recognised
 */
export function parseMarkers(source) {
  const lines = source.split(/\r?\n/u);
  /** @type {Map<number, Set<string>>} */
  const debts = new Map();
  /** @type {string[]} */
  const structural = [];
  let heading = '(before the first heading)';
  let numberedSections = 0;
  let fenceOpenedAt = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    // Fenced blocks are skipped so an example marker written inside ``` — the
    // natural way to document the format — is not mistaken for a live one.
    if (FENCE.test(line)) {
      fenceOpenedAt = fenceOpenedAt === 0 ? index + 1 : 0;
      continue;
    }
    if (fenceOpenedAt !== 0) continue;

    if (ANY_HEADING.test(line)) {
      heading = line.replace(/^#+\s*/u, '');

      // A numbered section must open with a marker; a subsection carries one
      // only where it diverges from its parent, so `###` is not required to.
      if (NUMBERED_SECTION.test(line)) {
        numberedSections += 1;

        let cursor = index + 1;
        while (cursor < lines.length && (lines[cursor] ?? '').trim() === '') cursor += 1;

        // Silent when the opening quote *leads* like a marker but does not
        // match: the check below reports that case precisely, and saying both
        // "has no marker" and "carries a marker in an undefined form" about
        // one typo is two complaints that contradict each other.
        const opening = joinBlockquote(lines, cursor).text;
        if (!MARKER.test(opening) && !MARKER_LEAD.test(opening)) {
          structural.push(`line ${index + 1}: "${heading}" has no conformance marker under it`);
        }
      }
      continue;
    }

    if (!line.startsWith('>')) continue;

    // Collected from anywhere in the document, not just under numbered
    // headings: subsection markers (§6's "Aggregation rule") carry debt too.
    // Captured before `index` moves past the run: a wrapped marker must be
    // reported at the line it starts on, not at the line it ends on.
    const start = index;
    const { text, end } = joinBlockquote(lines, index);
    index = end - 1;

    if (MARKER_LEAD.test(text) && !MARKER.test(text)) {
      structural.push(`line ${start + 1}: "${heading}" carries a marker in a form the legend does not define`);
      continue;
    }

    const debt = text.match(MARKER)?.[1];
    if (!debt) continue;

    for (const raw of debt.split(',')) {
      const number = Number(raw.trim().slice(1));
      const citedBy = debts.get(number) ?? new Set();
      citedBy.add(heading);
      debts.set(number, citedBy);
    }
  }

  // An unterminated fence silently swallows every section after it, and the
  // sections it swallows are never reported as missing a marker because the
  // structural check only complains about sections it finds. Left undetected,
  // this is the check disabling itself and still printing a pass.
  if (fenceOpenedAt !== 0) {
    structural.push(
      `line ${fenceOpenedAt}: unterminated \`\`\` fence — everything below it was skipped`,
    );
  }

  return { debts, structural, numberedSections };
}

/**
 * Resolves the repository to query, as a validated pair.
 *
 * Derived from the git remote rather than hardcoded so a rename or a fork
 * cannot leave this script quietly querying a different repository's issues.
 *
 * The two sources get two patterns on purpose. `GITHUB_REPOSITORY` is always
 * exactly `owner/name`, so it is matched anchored; a remote URL genuinely
 * needs a lenient tail match. Sharing one pattern gave the strict case the
 * loose treatment — `a/b/c` silently resolved to `b/c`, and a URL in the
 * environment variable resolved to its last two segments.
 *
 * @returns {{ owner: string, name: string }} the repository to query
 */
export function resolveRepo() {
  // Truthy, not `!== undefined`: an exported-but-empty GITHUB_REPOSITORY means
  // "nobody set this", and falling through to the remote is more useful than
  // failing on a variable the caller never meant to supply.
  const fromCi = process.env.GITHUB_REPOSITORY;

  if (fromCi) {
    const match = fromCi.match(/^([^/:\s]+)\/([^/:\s]+)$/u);
    if (!match?.[1] || !match[2]) {
      throw new Error(`GITHUB_REPOSITORY="${fromCi}" is not an owner/name pair`);
    }
    return { owner: match[1], name: match[2] };
  }

  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const match = remote.match(/[:/]([^/:\s]+)\/([^/:\s]+?)(?:\.git)?$/u);
  if (!match?.[1] || !match[2]) {
    throw new Error(`cannot derive owner/name from git remote "${remote}"`);
  }

  return { owner: match[1], name: match[2] };
}

/**
 * Resolves every cited issue in a single GraphQL request.
 *
 * One request rather than one per issue, and `repository.issue(number:)`
 * returns null for a number that belongs to a pull request — so citing a PR
 * by mistake is reported as missing instead of silently tracking that PR's
 * state, which the REST `/issues/{n}` endpoint would have done.
 *
 * @param {number[]} numbers - issue numbers cited by markers
 * @param {{ owner: string, name: string }} repo - repository to query
 * @param {string} token - GitHub API bearer token
 * @returns {Promise<{ states: Map<number, string>, error?: string }>} state per
 *   issue (`OPEN`, `CLOSED` or `MISSING`), or a transport-level error
 */
export async function resolveIssues(numbers, repo, token) {
  if (numbers.length === 0) return { states: new Map() };

  // Owner and name travel as GraphQL variables. The aliased issue fields
  // cannot — an alias is not parameterisable — but those numbers came from a
  // `#\d+` match, so they are integers by construction.
  const fields = numbers.map((number) => `i${number}: issue(number: ${number}) { state }`).join(' ');
  const query = `query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) { ${fields} }
  }`;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { owner: repo.owner, name: repo.name } }),
      // Without a deadline a stalled connection holds the CI job open until
      // the runner's own limit; the abort surfaces through the catch below as
      // an ordinary reported problem.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return { states: new Map(), error: `GitHub API returned ${response.status}` };

    const body = await response.json();

    // A number that is not an issue comes back as a null field plus a
    // NOT_FOUND whose path names that alias. NOT_FOUND on `repository` itself
    // is a different animal: without this distinction an unreachable
    // repository reported every cited issue as missing — one accusation
    // against the document per marker, and nothing about connectivity.
    const errors = /** @type {{ type?: string, message: string, path?: string[] }[]} */ (body.errors ?? []);
    const fatal = errors.filter((e) => e.type !== 'NOT_FOUND' || (e.path?.length ?? 0) <= 1);
    if (fatal.length > 0) {
      return { states: new Map(), error: fatal.map((e) => e.message).join('; ') };
    }

    if (!body.data?.repository) {
      return { states: new Map(), error: `repository ${repo.owner}/${repo.name} returned no data — check the token's access` };
    }

    const states = new Map(
      numbers.map((number) => [number, body.data.repository[`i${number}`]?.state ?? 'MISSING']),
    );
    return { states };
  } catch (cause) {
    return { states: new Map(), error: formatCause(cause) };
  }
}

/**
 * Runs the check and reports. Every failure — including a missing token, an
 * unreadable document and an underivable repository — goes through `report`,
 * so none of them reaches the user as an uncaught stack trace.
 *
 * @param {string} [docPath] - path to the conventions document
 * @returns {Promise<void>} resolves once the outcome has been printed
 */
export async function run(docPath = DEFAULT_DOC_PATH) {
  /** @type {string[]} */
  const problems = [];

  /** @type {string} */
  let source;
  try {
    source = await readFile(docPath, 'utf8');
  } catch (cause) {
    problems.push(
      `cannot read ${docPath} (${formatCause(cause)}) — paths are resolved from the ` +
      'repository root, so run this through `npm run check:markers`',
    );
    return report(docPath, problems, 0);
  }

  const { debts, structural, numberedSections } = parseMarkers(source);
  problems.push(...structural);

  // A parser that silently stops recognising the document would report a
  // clean run forever. Zero numbered sections means the two have diverged.
  if (numberedSections === 0) {
    problems.push('parsed 0 numbered sections — the parser and the document have diverged');
    return report(docPath, problems, 0);
  }

  // Nothing to ask the API about, so neither a token nor a repository is
  // needed: a document carrying only ✅ markers must not fail because it was
  // checked without credentials, or from outside a git work tree.
  const numbers = [...debts.keys()];
  if (numbers.length === 0) return report(docPath, problems, 0);

  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    problems.push(
      'GITHUB_TOKEN (or GH_TOKEN) is not set — CI supplies it; for a local run see ' +
      'docs/ONBOARDING.md → "Корисні команди"',
    );
    return report(docPath, problems, 0);
  }

  /** @type {{ owner: string, name: string }} */
  let repo;
  try {
    repo = resolveRepo();
  } catch (cause) {
    problems.push(`cannot determine which repository to query (${formatCause(cause)})`);
    return report(docPath, problems, 0);
  }

  const slug = `${repo.owner}/${repo.name}`;
  const { states, error } = await resolveIssues(numbers, repo, token);

  if (error) {
    problems.push(`could not check ${numbers.length} issues against ${slug}: ${error}`);
    return report(docPath, problems, 0);
  }

  for (const number of numbers) {
    const where = [...(debts.get(number) ?? [])].join('; ');
    const state = states.get(number);

    if (state === 'MISSING') {
      problems.push(`#${number} is not an issue in ${slug}, but ${where} names it`);
    } else if (state !== 'OPEN') {
      // The verb matters: the legend says a closed issue is *dropped* from the
      // marker. "Name the issue that remains" read just as easily as "add
      // another number", which would leave the closed one in place.
      problems.push(
        `#${number} is closed, but ${where} is still marked 🔧 — drop #${number} from that marker, ` +
        'or flip the marker to ✅ if nothing else remains',
      );
    }
  }

  return report(docPath, problems, debts.size);
}

/**
 * Prints the outcome. The success line is printed **only** on success: an
 * earlier revision logged it unconditionally, so a failing run ended by
 * announcing that everything was fine.
 *
 * @param {string} docPath - path to the conventions document
 * @param {string[]} problems - everything wrong, empty when the check passes
 * @param {number} checked - how many distinct debt issues were resolved
 * @returns {void}
 */
function report(docPath, problems, checked) {
  if (problems.length === 0) {
    console.log(`${docPath}: ${checked} debt issues checked, all still open.`);
    return;
  }

  console.error(`${docPath} markers are out of step with reality:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(`\nLegend and flip rule: ${docPath}, "Conformance markers".`);
  markFailed();
}

// Only when executed directly, so the parser above can be imported by tests.
// `check-conformance-markers.test.mjs` spawns this file as a child process:
// if this comparison ever stops matching, the script would exit 0 having done
// nothing, and that silent pass is exactly what the spawn test catches.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(process.argv[2]);
}
