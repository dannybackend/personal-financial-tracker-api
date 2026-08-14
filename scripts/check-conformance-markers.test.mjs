import { describe, it, expect, afterAll } from 'vitest';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMarkers, resolveRepo } from './check-conformance-markers.mjs';

const SCRIPT = 'scripts/check-conformance-markers.mjs';

/**
 * Temp directories created by the CLI tests, removed once they have run.
 *
 * @type {string[]}
 */
const scratch = [];

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

/**
 * Creates a throwaway document and registers its directory for cleanup.
 *
 * @param {string} contents - markdown to write
 * @returns {Promise<string>} path to the document
 */
async function scratchDoc(contents) {
  const dir = await mkdtemp(join(tmpdir(), 'markers-'));
  scratch.push(dir);

  const doc = join(dir, 'doc.md');
  await writeFile(doc, contents);
  return doc;
}

/**
 * Runs the script as a child process, the way npm and CI do.
 *
 * @param {string} docPath - document to check
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>} outcome
 */
async function runCli(docPath) {
  // Credentials are stripped deliberately: a document with no debt markers
  // reaches no network, so it must run without a token at all. Leaving the
  // parent's token in place would hide a regression that reinstates the
  // check before the empty-markers short-circuit.
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, GITHUB_REPOSITORY: 'owner/name' };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;

  try {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [SCRIPT, docPath],
      { env },
    );
    return { code: 0, stdout, stderr };
  } catch (cause) {
    // promisify(execFile) rejects with the Error carrying the child's exit
    // code and both captured streams - but only once the child actually ran.
    // A spawn failure rejects with a string code (ENOENT), and swallowing
    // that would report a moved or renamed script as an ordinary exit 1.
    const failed = /** @type {{ code?: unknown, stdout?: string, stderr?: string }} */ (cause);
    if (typeof failed.code !== 'number') {
      throw new Error(
        `could not spawn ${SCRIPT} (${String(failed.code)}) - paths here are relative to the repository root`,
        { cause },
      );
    }
    return { code: failed.code, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' };
  }
}

// The parser is the half of this script that can be wrong silently: it talks
// to no network, so a regression that stops recognising markers reports a
// clean run instead of failing. Both bugs found in it so far - subsection
// markers skipped entirely, and the success line printed on failure - were
// caught by hand-run fixtures that lived nowhere. These are those fixtures.

describe('parseMarkers', () => {
  it('collects every issue a debt marker names', () => {
    const { debts } = parseMarkers([
      '## 4. Error shape',
      '',
      '> 🔧 **debt #49, #50** — no global handler exists.',
    ].join('\n'));

    expect([...debts.keys()]).toEqual([49, 50]);
    expect([...(debts.get(49) ?? [])]).toEqual(['4. Error shape']);
  });

  it('accepts all three marker forms the legend defines', () => {
    const { structural } = parseMarkers([
      '## 1. Ownership',
      '',
      '> ✅ **holds, vacuously** — no handler takes a body id yet.',
      '',
      '## 2. Handler order',
      '',
      '> ✅ **holds** — accounts.ts follows it.',
      '',
      '## 3. Money',
      '',
      '> 🔧 **debt #37** — no CHECK constraint.',
    ].join('\n'));

    expect(structural).toEqual([]);
  });

  it('reads a debt marker whose issue list wraps across lines', () => {
    // The document wraps at 80 columns, so a marker naming five or six issues
    // will eventually be broken after a comma.
    const { debts, structural } = parseMarkers([
      '## 9. Soft delete',
      '',
      '> 🔧 **debt #15, #39, #45,',
      '> #46, #47** — archived_at does not exist.',
    ].join('\n'));

    expect([...debts.keys()]).toEqual([15, 39, 45, 46, 47]);
    expect(structural).toEqual([]);
  });

  it('collects markers on subsections, not only numbered sections', () => {
    const { debts } = parseMarkers([
      '## 6. Currency',
      '',
      '> ✅ **holds** — shipped in #36.',
      '',
      '### Aggregation rule',
      '',
      '> 🔧 **debt #45, #46, #47** — nothing sums across accounts yet.',
    ].join('\n'));

    expect([...debts.keys()]).toEqual([45, 46, 47]);
    expect([...(debts.get(45) ?? [])]).toEqual(['Aggregation rule']);
  });

  it('reports a numbered section that opens without a marker', () => {
    const { structural } = parseMarkers([
      '## 7. Dates and time',
      '',
      'A transaction has a calendar date, not an instant.',
    ].join('\n'));

    expect(structural).toHaveLength(1);
    expect(structural[0]).toContain('7. Dates and time');
  });

  it('treats a quote led by an unknown glyph as no marker at all', () => {
    // ⚠️ is not one of the two marker glyphs, so this falls to the
    // section-level branch rather than the undefined-form one below. The
    // message is asserted because the two branches are easy to confuse.
    const { structural, debts } = parseMarkers([
      '## 8. Pagination',                                    // line 1
      '',                                                    // line 2
      '> ⚠️ **partially done #16** — invented on the spot.', // line 3
    ].join('\n'));

    expect(debts.size).toBe(0);
    expect(structural).toEqual(['line 1: "8. Pagination" has no conformance marker under it']);
  });

  it('ignores markers inside fenced code blocks', () => {
    const { debts } = parseMarkers([
      '## 1. Ownership',
      '',
      '> ✅ **holds** — nothing to violate.',
      '',
      'Write the marker like this:',
      '',
      '```markdown',
      '> 🔧 **debt #123** — an example, not a live marker.',
      '```',
    ].join('\n'));

    expect(debts.size).toBe(0);
  });

  it('reports a blockquote that leads like a marker but does not match', () => {
    // The second way this parser can quietly stop working: only the 🔧 branch
    // has a capture group, so breaking it alone would leave every section
    // matching, debts empty, and the run exiting 0.
    const { structural, debts } = parseMarkers([
      '## 4. Error shape',                                          // line 1
      '',                                                           // line 2
      '> 🔧 **debt 49 and 50** — numbers written without the hash.', // line 3
    ].join('\n'));

    expect(debts.size).toBe(0);
    // Exactly one complaint: the section-level check must not also claim the
    // marker is absent, which would contradict this one.
    expect(structural).toEqual(['line 3: "4. Error shape" carries a marker in a form the legend does not define']);
  });

  it('points at the first line of a wrapped marker, not the last', () => {
    const { structural } = parseMarkers([
      '## 9. Soft delete',              // line 1
      '',                               // line 2
      '> 🔧 **debt 15, 39,',            // line 3 <- starts here
      '> 45** — hashes missing.',       // line 4
    ].join('\n'));

    expect(structural).toEqual(['line 3: "9. Soft delete" carries a marker in a form the legend does not define']);
  });

  it('reports an unterminated fence instead of silently skipping the rest', () => {
    // Without this the fence swallows every section below it, and those
    // sections are never reported as missing a marker either - the check
    // disables itself and still prints a pass.
    const { structural, numberedSections } = parseMarkers([
      '## 5. Money',
      '',
      '> 🔧 **debt #37** — no CHECK constraint.',
      '',
      '```sql',
      'SELECT 1;',
      '',
      '## 6. Currency',
      '',
      'this section is invisible to the parser',
    ].join('\n'));

    expect(numberedSections).toBe(1);
    expect(structural).toHaveLength(1);
    expect(structural[0]).toContain('unterminated');
  });

  it('counts numbered sections so a parser that stops matching cannot pass', () => {
    expect(parseMarkers('no headings here at all').numberedSections).toBe(0);
    expect(parseMarkers('## 1. One\n\n> ✅ **holds** — x.').numberedSections).toBe(1);
  });

  it('records every section citing the same issue', () => {
    const { debts } = parseMarkers([
      '## 7. Dates and time',
      '',
      '> 🔧 **debt #39** — archived_at is missing.',
      '',
      '## 9. Soft delete',
      '',
      '> 🔧 **debt #39** — and DELETE hard-deletes.',
    ].join('\n'));

    expect([...(debts.get(39) ?? [])]).toEqual(['7. Dates and time', '9. Soft delete']);
  });
});

describe('resolveRepo', () => {
  // GITHUB_REPOSITORY is matched anchored while a remote URL is matched by
  // tail. Sharing one pattern let the environment variable inherit the URL
  // leniency: "a/b/c" resolved to b/c, and a full URL to its last two
  // segments - both silently, and both producing "no such repository" later.

  /**
   * Calls resolveRepo with GITHUB_REPOSITORY set, restoring it afterwards.
   *
   * @param {string} value - the value to test
   * @returns {{ owner: string, name: string }} the resolved pair
   */
  function withEnv(value) {
    const original = process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_REPOSITORY = value;
    try {
      return resolveRepo();
    } finally {
      if (original === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = original;
    }
  }

  it('accepts a well-formed owner/name pair', () => {
    // Deliberately synthetic: this exercises the parse, not this repository's
    // identity, and a real name here would invite an edit on every rename.
    expect(withEnv('some-owner/some-repo')).toEqual({
      owner: 'some-owner',
      name: 'some-repo',
    });
  });

  it('treats an exported-but-empty value as unset and falls back to the remote', () => {
    // Not a hard failure: an empty GITHUB_REPOSITORY means nobody set it.
    // Asserted by shape, not by name - pinning the literal owner/name here
    // would put back the hardcoded identity that was taken out of the script.
    const repo = withEnv('');

    expect(repo.owner.length).toBeGreaterThan(0);
    expect(repo.name.length).toBeGreaterThan(0);
  });

  it.each([
    ['justonesegment', 'no slash'],
    ['a/b/c', 'extra segments'],
    ['https://evil.example/a/b', 'a URL, not a pair'],
    ['owner/', 'empty name'],
    ['/name', 'empty owner'],
  ])('rejects %j (%s)', (value) => {
    expect(() => withEnv(value)).toThrow(/is not an owner\/name pair/u);
  });
});

describe('the command line', () => {
  // The direct-execution guard compares import.meta.url with argv[1]. If that
  // comparison ever stops matching - a symlinked checkout, a drive-letter case
  // difference - the script exits 0 having done nothing, and CI reads the
  // silent pass as success. These two spawns are what notice.

  it('runs and reports success on a clean document', async () => {
    const doc = await scratchDoc('## 1. Ownership\n\n> ✅ **holds** — nothing to violate.\n');

    const { code, stdout } = await runCli(doc);

    expect(code).toBe(0);
    expect(stdout).toContain('0 debt issues checked');
  });

  it('exits non-zero and explains itself on a document it cannot read', async () => {
    const { code, stderr } = await runCli(join(tmpdir(), 'markers-absent', 'nope.md'));

    expect(code).toBe(1);
    expect(stderr).toContain('cannot read');
    // The failure must be a report, not an uncaught rejection.
    expect(stderr).not.toContain('node:internal');
  });
});

describe('the live document', () => {
  it('parses with every numbered section marked', async () => {
    const source = await readFile('docs/API-CONVENTIONS.md', 'utf8');
    const { structural, numberedSections, debts } = parseMarkers(source);

    expect(structural).toEqual([]);
    expect(numberedSections).toBe(11);
    expect(debts.size).toBeGreaterThan(0);
  });
});
