#!/usr/bin/env node
// @ts-check

/**
 * Generates (or verifies) the table of contents for the long narrative docs.
 *
 * Why a script and not a hand-written list: `docs/DECISIONS.md` alone carries 50+
 * entries. A hand-maintained index of that is the same class of claim as a
 * `path:` glob pointing at a directory that never existed — it reads as true long
 * after it stopped being true, and nothing signals otherwise. The two sibling
 * checks (`check-conformance-markers.mjs`, `check-config-paths.mjs`) exist for
 * that same reason.
 *
 * Correction chains: an entry in `DECISIONS.md` may revise an earlier one. The
 * relationship is declared in the entry body as `**Уточнює:**` / `**Виправляє:**`
 * / `**Оновлює:**` / `**Звужує:**` / `**Виконує:**`, and the superseded entry
 * carries `**Виправлено:**`. The TOC surfaces both directions, so a reader sees
 * which entries are still current without reading the file in order — the one
 * thing a chronological log cannot do for them. The rule for maintaining that
 * file lives in its own header and is not restated here.
 *
 * Fails loudly rather than guessing. Every input it does not fully understand —
 * a half-present marker pair, a declared cross-reference with no value, an
 * unreadable target — is a reported problem, never a silent skip. That is the
 * same stance `check-config-paths.mjs` takes on "declared the key, parsed zero
 * entries": a check that quietly does nothing is worse than no check, because it
 * still occupies a slot in the list of things believed to be guarded.
 *
 * Usage:
 *   node scripts/generate-toc.mjs            # rewrite the TOC blocks in place
 *   node scripts/generate-toc.mjs --check    # exit 1 if any block is stale
 *
 * Run locally with `npm run toc` / `npm run check:toc`; needs no token and no
 * network. Plain JavaScript for the same reason as its siblings — it runs from
 * CI with no build step and no `npm ci`, and `tsconfig.scripts.json` type checks
 * it anyway under `checkJs`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { formatCause, markFailed } from './lib/report.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const START = '<!-- toc:start -->';
const END = '<!-- toc:end -->';

/** Heading the generator inserts above the index. */
const TOC_TITLE = 'Зміст';

/** Fields by which a later entry declares it revises an earlier one. */
const REVISES_FIELDS = ['Уточнює', 'Виправляє', 'Оновлює', 'Звужує', 'Виконує'];
/** Field by which a superseded entry points forward to its correction. */
const REVISED_FIELD = 'Виправлено';

/** Documents that carry a generated TOC. */
const TARGETS = ['docs/DECISIONS.md', 'docs/LEARNING.md', 'docs/BOOTSTRAP.md'];

/**
 * @typedef {{ level: number, title: string }} Heading
 * @typedef {{ heading: Heading, body: string[] }} Entry
 * @typedef {{ heading: Heading, entries: Entry[] }} Section
 * @typedef {{ headings: Heading[], sections: Section[] }} Document
 */

/**
 * Slugify a heading the way GitHub does: lowercase, drop punctuation, spaces to
 * hyphens. Letters, numbers, marks, connector punctuation and hyphens survive,
 * which keeps Cyrillic intact and strips backticks, colons and parentheses.
 *
 * @param {string} heading
 * @returns {string}
 */
export function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\p{Pc}\- ]/gu, '')
    .trim()
    .replace(/ /g, '-');
}

/**
 * Strip markdown emphasis and code ticks from heading text for display.
 *
 * @param {string} heading
 * @returns {string}
 */
function plain(heading) {
  return heading.replace(/`/g, '').replace(/\*\*/g, '');
}

/**
 * Parse a markdown document into every heading in order plus the h2/h3 tree.
 *
 * Both are returned because they answer different questions: the tree builds the
 * index, while the flat list carries the *document order of every heading* that
 * GitHub's duplicate-anchor counter walks — including the h1, which never
 * appears in the index but does advance that counter.
 *
 * @param {string} text - LF-normalised document, TOC block already removed
 * @returns {Document}
 */
export function parse(text) {
  /** @type {Heading[]} */
  const headings = [];
  /** @type {Section[]} */
  const sections = [];
  /** @type {Entry | null} */
  let entry = null;
  let inFence = false;

  for (const line of text.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    if (inFence) {
      if (entry) entry.body.push(line);
      continue;
    }

    const match = /^(#{1,3}) (.+)$/.exec(line);
    const hashes = match?.[1];
    const title = match?.[2];
    if (hashes === undefined || title === undefined) {
      if (entry) entry.body.push(line);
      continue;
    }

    const heading = { level: hashes.length, title: title.trim() };
    headings.push(heading);

    if (heading.level === 1) {
      entry = null;
    } else if (heading.level === 2) {
      sections.push({ heading, entries: [] });
      entry = null;
    } else {
      // An h3 before any h2 (none today) lands in a section of its own rather
      // than crashing or attaching to nothing.
      let current = sections[sections.length - 1];
      if (!current) {
        current = { heading, entries: [] };
        sections.push(current);
      }
      entry = { heading, body: [] };
      current.entries.push(entry);
    }
  }

  return { headings, sections };
}

/**
 * Assign every heading its GitHub anchor, in the order the *rendered* document
 * will present them — which includes the `## Зміст` this generator inserts.
 *
 * Skipping that one would desynchronise the duplicate counter from GitHub the
 * moment any heading collided with it, producing a link that scrolls nowhere.
 *
 * @param {Heading[]} headings - every heading, document order, TOC block excluded
 * @returns {Map<Heading, string>} anchor per heading
 */
function assignAnchors(headings) {
  /** @type {Map<string, number>} */
  const seen = new Map();

  /** @param {string} title */
  const take = (title) => {
    const base = slugify(title);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };

  /** @type {Map<Heading, string>} */
  const anchors = new Map();
  let injected = false;

  for (const heading of headings) {
    // `splice` puts the TOC after the leading h1 and before the first h2.
    if (!injected && heading.level >= 2) {
      take(TOC_TITLE);
      injected = true;
    }
    anchors.set(heading, take(heading.title));
  }
  if (!injected) take(TOC_TITLE);

  return anchors;
}

/**
 * Read the value of a bold field line (`**Name:** value`) from an entry body.
 *
 * Returns `null` when the field is absent and the empty string when it is
 * present but carries no value — the caller must distinguish those, because a
 * declared-but-empty cross-reference is an authoring mistake that would
 * otherwise drop the entry's warning from the index without a word.
 *
 * @param {string[]} body
 * @param {string} field
 * @returns {string | null}
 */
function readField(body, field) {
  const prefix = `**${field}:**`;
  for (const line of body) {
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  return null;
}

/**
 * Build the TOC markdown body for one document.
 *
 * @param {Document} doc
 * @param {Map<Heading, string>} anchors
 * @param {string[]} problems - appended to on authoring mistakes
 * @param {string} path - document path, for problem messages
 * @returns {string}
 */
function buildToc(doc, anchors, problems, path) {
  /** @type {string[]} */
  const out = [];

  for (const section of doc.sections) {
    const anchor = anchors.get(section.heading);
    const title = plain(section.heading.title);

    if (section.entries.length === 0) {
      // No trailing blank: consecutive entry-less sections form one list.
      out.push(`- [${title}](#${anchor})`);
      continue;
    }

    // Blank line first, or a label straight after a list item is parsed as a
    // lazy continuation of that item rather than its own paragraph.
    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
    out.push(`**${title}**`, '');

    for (const item of section.entries) {
      /** @type {string[]} */
      const notes = [];

      for (const field of [...REVISES_FIELDS, REVISED_FIELD]) {
        const value = readField(item.body, field);
        if (value === null) continue;
        if (value === '') {
          problems.push(
            `${path} → "${item.heading.title}": **${field}:** declares a ` +
            'cross-reference but carries no value on the same line, so the index ' +
            'would silently omit it. Put the target on the field line',
          );
          continue;
        }
        notes.push(
          field === REVISED_FIELD
            ? '⚠️ має пізніше уточнення'
            : `${field.toLowerCase()} ${plain(value).replace(/\.$/, '')}`,
        );
      }

      const link = `[${plain(item.heading.title)}](#${anchors.get(item.heading)})`;
      out.push(`- ${link}${notes.length ? ` — *${notes.join('; ')}*` : ''}`);
    }
    out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Decide where this document's TOC block goes, or why it cannot have one.
 *
 * Every answer is a value, including both failures. An earlier revision returned
 * a value for the half-present pair but *threw* when there was no `---` to
 * insert before — two cases of "I cannot safely place a block here", one routed
 * to a reported problem and the other to an unguarded stack trace. They take the
 * same route now.
 *
 * A half-present pair is refused rather than repaired: it used to fall through to
 * the insert path, which appended a second block and left the orphan above it,
 * and the next run then treated the orphan as the block start and deleted every
 * line between the two. There is no safe way to guess which half was intended.
 *
 * @param {string} text
 * @returns {{ start: number, end: number } | { insertAt: number } | 'broken' | 'no-anchor'}
 */
export function locateBlock(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);

  if (start !== -1 && end !== -1 && end > start) return { start, end };
  if (start !== -1 || end !== -1) return 'broken';

  // No markers yet: the block goes above the first `---` rule, after the intro.
  const rule = text.indexOf('\n---\n');
  return rule === -1 ? 'no-anchor' : { insertAt: rule + 1 };
}

/**
 * Produce the document with its TOC block written in at the located position.
 *
 * @param {string} text - LF-normalised document
 * @param {string} toc
 * @param {{ start: number, end: number } | { insertAt: number }} block
 * @returns {string}
 */
function splice(text, toc, block) {
  const rendered = `${START}\n\n## ${TOC_TITLE}\n\n${toc}\n\n${END}`;

  if ('insertAt' in block) {
    // The same one-blank-line spacing the replace branch normalises to. A single
    // newline here would make the very next run "fix" the spacing and report the
    // document stale, leaving it forever one pass behind itself.
    return `${text.slice(0, block.insertAt)}\n${rendered}\n\n${text.slice(block.insertAt)}`;
  }

  // Exactly one blank line after the block: a bare `---` on the very next line is
  // ambiguous markdown, and re-running must not accumulate more.
  const rest = text.slice(block.end + END.length).replace(/^\n*/, '\n\n');
  return text.slice(0, block.start) + rendered + rest;
}

/**
 * Compute the rewritten document for one target.
 *
 * @param {string} raw - file contents as read
 * @param {string} path - repository-relative path, for problem messages
 * @param {string[]} problems
 * @returns {{ before: string, after: string, eol: string } | null} null when unusable
 */
export function render(raw, path, problems) {
  // Work on LF, then restore whatever the file used. Rewriting every line ending
  // would bury the real diff under a whole-file change.
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const before = raw.replace(/\r\n/g, '\n');

  const block = locateBlock(before);

  if (block === 'broken') {
    problems.push(
      `${path} has only one of the two TOC markers, or they are out of order. ` +
      `Restore the pair (${START} … ${END}) by hand — writing a second block ` +
      'here would make the next run delete everything between them',
    );
    return null;
  }
  if (block === 'no-anchor') {
    problems.push(
      `${path} carries no TOC markers and no \`---\` rule to insert them above, ` +
      'so there is nowhere to put the index. Add the marker pair where it belongs',
    );
    return null;
  }

  // Parse without the existing block, or the index lists itself and the script
  // never reaches a fixed point.
  const stripped = 'insertAt' in block
    ? before
    : before.slice(0, block.start) + before.slice(block.end + END.length);
  const doc = parse(stripped);
  const toc = buildToc(doc, assignAnchors(doc.headings), problems, path);

  return { before, after: splice(before, toc, block), eol };
}

/**
 * Prints the outcome. The success line is printed **only** on success.
 *
 * @param {string[]} problems
 * @param {string[]} stale - targets whose block is out of date (`--check` only)
 * @param {boolean} check
 * @returns {void}
 */
function report(problems, stale, check) {
  if (problems.length === 0 && stale.length === 0) {
    console.log(
      check
        ? `toc: усі ${TARGETS.length} файли актуальні`
        : 'toc: змін немає',
    );
    return;
  }

  if (problems.length > 0) {
    console.error('Не вдалося побудувати зміст:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
  }
  if (stale.length > 0) {
    console.error(`${problems.length > 0 ? '\n' : ''}Зміст застарів у:\n`);
    for (const path of stale) console.error(`  - ${path}`);
    console.error('\nПерегенеруй: npm run toc');
  }
  markFailed();
}

/**
 * @param {boolean} check - verify only, do not write
 * @returns {void}
 */
function run(check) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const stale = [];
  let wrote = 0;

  // Render everything first, write nothing yet. A document whose index came out
  // incomplete must not reach disk: an index that is merely stale announces
  // itself on the next `--check`, while one that is confidently wrong does not.
  // All-or-nothing also keeps a mid-run failure from leaving the set half
  // rewritten.
  /** @type {{ path: string, full: string, text: string }[]} */
  const pending = [];

  for (const path of TARGETS) {
    const full = join(repoRoot, path);

    /** @type {string} */
    let raw;
    try {
      raw = readFileSync(full, 'utf8');
    } catch (cause) {
      // Named, not a raw ENOENT stack: in CI the only output is this line.
      problems.push(`cannot read ${path} (${formatCause(cause)})`);
      continue;
    }

    const rendered = render(raw, path, problems);
    if (!rendered || rendered.before === rendered.after) continue;

    if (check) stale.push(path);
    else pending.push({ path, full, text: rendered.after.replace(/\n/g, rendered.eol) });
  }

  if (problems.length === 0) {
    for (const { path, full, text } of pending) {
      try {
        writeFileSync(full, text);
      } catch (cause) {
        problems.push(`cannot write ${path} (${formatCause(cause)})`);
        continue;
      }
      wrote += 1;
      console.log(`toc: updated ${path}`);
    }
  }

  if (!check && wrote > 0 && problems.length === 0) return;
  report(problems, stale, check);
}

// Only when executed directly, so the parsers above can be imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.includes('--check'));
}
