// @ts-check

/**
 * Covers `generate-toc.mjs`, which owns two things nothing else can check: the
 * anchors in the generated index, and the refusal to write when it does not
 * fully understand the document.
 *
 * Four of these cases are regressions for defects found in review, and each one
 * failed silently — a destroyed paragraph, a dropped warning, an anchor that
 * scrolls nowhere. That is the argument for the file existing: every failure
 * this script can have looks exactly like success from the outside.
 *
 * Most cases drive the exported readers directly, so they need no filesystem.
 * The write-refusal case runs the real CLI, because "did not write" is a
 * property of the process, not of a pure function.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile, rm, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { slugify, parse, locateBlock, render } from './generate-toc.mjs';

const START = '<!-- toc:start -->';
const END = '<!-- toc:end -->';

/** @type {string[]} */
const scratch = [];

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

/**
 * Renders a document and returns the index plus anything the run complained
 * about.
 *
 * @param {string} text
 * @returns {{ toc: string, after: string, problems: string[], eol: string } | null}
 */
function build(text) {
  /** @type {string[]} */
  const problems = [];
  const result = render(text, 'docs/TEST.md', problems);
  if (!result) return null;

  const from = result.after.indexOf(START);
  const to = result.after.indexOf(END);
  return {
    toc: result.after.slice(from + START.length, to),
    after: result.after,
    problems,
    eol: result.eol,
  };
}

/** A minimal document with the shape the real ones have. */
const DOC = [
  '# Заголовок файлу',
  '',
  '---',
  '',
  '## Секція',
  '',
  '### Перший запис',
  '',
  '**Рішення:** текст.',
  '',
  '### Другий запис',
  '',
  '**Рішення:** текст.',
  '',
].join('\n');

describe('slugify matches the anchors GitHub generates', () => {
  // Pinned against anchors already hand-written and verified in
  // docs/API-CONVENTIONS.md, so this agrees with something independently known
  // to work rather than with itself.
  it('drops the punctuation GitHub drops and keeps the rest', () => {
    expect(slugify('1. Ownership: the rule that FKs do not enforce'))
      .toBe('1-ownership-the-rule-that-fks-do-not-enforce');
    expect(slugify('11. Naming and shapes')).toBe('11-naming-and-shapes');
  });

  it('keeps Cyrillic and underscores, strips backticks and dots', () => {
    expect(slugify('`timestamptz` для `created_at`, `date` для `transactions.date`'))
      .toBe('timestamptz-для-created_at-date-для-transactionsdate');
  });

  it('leaves the doubled hyphen an em dash produces, as GitHub does', () => {
    // The dash is removed and both surrounding spaces become hyphens; collapsing
    // them would silently break every heading in the repository that uses one.
    expect(slugify('Видалення рахунку — soft delete')).toBe('видалення-рахунку--soft-delete');
  });
});

describe('parse', () => {
  it('does not mistake a heading inside a fenced block for a heading', () => {
    // docs/LEARNING.md documents its own entry format inside a ```md fence. That
    // sample contains `### Назва концепції`, which must never reach the index.
    const doc = parse(['## Формат', '', '```md', '### Назва концепції', '```', ''].join('\n'));

    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]?.entries).toHaveLength(0);
    expect(doc.headings.map((h) => h.title)).toEqual(['Формат']);
  });

  it('records the h1, which never appears in the index but does shift anchors', () => {
    const doc = parse(DOC);
    expect(doc.headings.map((h) => h.level)).toEqual([1, 2, 3, 3]);
  });
});

describe('anchors', () => {
  it('suffixes a repeated heading the way GitHub disambiguates it', () => {
    const built = build(DOC.replace('### Другий запис', '### Перший запис'));
    expect(built?.toc).toContain('(#перший-запис)');
    expect(built?.toc).toContain('(#перший-запис-1)');
  });

  it('counts the Зміст heading it inserts itself', () => {
    // The generated `## Зміст` is a real heading in the rendered document, so a
    // section actually named Зміст is GitHub's *second* one. Miss this and the
    // link points at the table of contents instead of the section. Uses an
    // entry-less section because those are the ones rendered as links — a
    // section with entries becomes a bold label and shows no anchor at all.
    const built = build(`# Файл\n\n---\n\n## Зміст\n\n текст\n\n## Далі\n\n### Запис\n`);

    expect(built?.toc).toContain('(#зміст-1)');
    expect(built?.toc).not.toContain('(#зміст)');
  });
});

describe('cross-reference fields', () => {
  it('renders a declared correction on the entry that carries it', () => {
    const built = build(DOC.replace(
      '### Другий запис\n\n**Рішення:** текст.',
      '### Другий запис\n\n**Виправляє:** «Перший запис» вище.\n**Рішення:** текст.',
    ));

    expect(built?.problems).toEqual([]);
    expect(built?.toc).toContain('виправляє «Перший запис» вище');
  });

  it('marks the superseded entry so a reader sees it is not current', () => {
    const built = build(DOC.replace(
      '### Перший запис\n\n**Рішення:** текст.',
      '### Перший запис\n\n**Виправлено:** див. нижче.\n**Рішення:** текст.',
    ));

    expect(built?.toc).toContain('⚠️ має пізніше уточнення');
  });

  it('reports a field declared with no value instead of dropping it', () => {
    // Regression: the value on the next line left `readField` returning '', the
    // truthiness guard treated it as absent, and the entry lost its warning
    // without a word — the exact failure this index exists to prevent.
    const built = build(DOC.replace(
      '### Перший запис\n\n**Рішення:** текст.',
      '### Перший запис\n\n**Виправлено:**\nдив. нижче.\n**Рішення:** текст.',
    ));

    expect(built?.problems.join('\n')).toContain('carries no value on the same line');
    expect(built?.toc).not.toContain('⚠️');
  });
});

describe('locateBlock', () => {
  const wrap = (/** @type {string} */ body) => `# T\n\n${body}\n\n---\n\n## S\n`;

  it('accepts a complete pair and reports where it sits', () => {
    const found = locateBlock(wrap(`${START}\nx\n${END}`));
    expect(found).toMatchObject({ start: expect.any(Number), end: expect.any(Number) });
  });

  it('points at the rule when there is no block yet', () => {
    expect(locateBlock(wrap('nothing here'))).toMatchObject({ insertAt: expect.any(Number) });
  });

  it.each([
    ['only the start marker', START],
    ['only the end marker', END],
    ['the markers reversed', `${END}\nx\n${START}`],
    ['two complete pairs', `${START}\nx\n${END}\n\n${START}\ny\n${END}`],
    ['a duplicated start marker', `${START}\nx\n${START}\ny\n${END}`],
  ])('refuses %s', (_label, body) => {
    expect(locateBlock(wrap(body))).toBe('broken');
  });

  it('refuses a document with no block and no rule to put one above', () => {
    // Returned as a value like every other refusal. This case used to throw from
    // inside `splice`, past the guards, and surfaced as a bare Node stack trace.
    expect(locateBlock('# T\n\n## S\n\n### E\n')).toBe('no-anchor');
  });
});

describe('render', () => {
  it('is idempotent — a second pass over its own output changes nothing', () => {
    const once = build(DOC);
    const twice = build(once?.after ?? '');
    expect(twice?.after).toBe(once?.after);
  });

  it('reports the file line ending so the writer can restore it', () => {
    expect(build(DOC.replace(/\n/g, '\r\n'))?.eol).toBe('\r\n');
    expect(build(DOC)?.eol).toBe('\n');
  });

  it('leaves exactly one blank line after the block on every pass', () => {
    const once = build(DOC);
    const twice = build(once?.after ?? '');
    expect(twice?.after.includes(`${END}\n\n---`)).toBe(true);
    expect(twice?.after.includes(`${END}\n\n\n`)).toBe(false);
  });

  it('refuses a half-present marker pair rather than inserting a second block', () => {
    /** @type {string[]} */
    const problems = [];
    const result = render(`# T\n\n${START}\n\nkeep me\n\n---\n\n## S\n`, 'docs/TEST.md', problems);

    expect(result).toBeNull();
    expect(problems.join('\n')).toContain('exactly one TOC marker pair');
  });

  it('refuses a duplicated pair instead of silently degrading the document', () => {
    // What a bad merge leaves when both sides generated an index. `indexOf` took
    // the first pair, the second survived, and its `## Зміст` heading was then
    // read as an ordinary section and listed inside the new index — the document
    // got worse on every run and nothing was reported.
    /** @type {string[]} */
    const problems = [];
    const doubled =
      `# T\n\n${START}\n\n## Зміст\n\n- [S](#s)\n\n${END}\n\n` +
      `${START}\n\n## Зміст\n\n- [S](#s)\n\n${END}\n\n---\n\n## S\n\n### E\n`;

    expect(render(doubled, 'docs/TEST.md', problems)).toBeNull();
    expect(problems.join('\n')).toContain('exactly one TOC marker pair');
  });

  it('reports a document with nowhere to put the block instead of throwing', () => {
    // Regression: `splice` threw here, from inside a call `run()` does not guard,
    // so adding a target without a `---` rule failed the job with a raw stack.
    /** @type {string[]} */
    const problems = [];
    let result;
    expect(() => {
      result = render('# T\n\n## S\n\n### E\n', 'docs/TEST.md', problems);
    }).not.toThrow();

    expect(result).toBeNull();
    expect(problems.join('\n')).toContain('nowhere to put the index');
  });
});

describe('the CLI as CI runs it', () => {
  it('writes nothing when a document has a half-present marker pair', async () => {
    // Regression for the destructive path: the old code appended a second block
    // below the orphan, and the *next* run treated the orphan as the block start
    // and deleted every line in between. Verified by content, not by exit code —
    // a run can fail loudly and still have already corrupted the file.
    const dir = await mkdtemp(join(tmpdir(), 'generate-toc-'));
    scratch.push(dir);

    await mkdir(join(dir, 'scripts/lib'), { recursive: true });
    await mkdir(join(dir, 'docs'), { recursive: true });
    await copyFile(resolve('scripts/generate-toc.mjs'), join(dir, 'scripts/generate-toc.mjs'));
    await copyFile(resolve('scripts/lib/report.mjs'), join(dir, 'scripts/lib/report.mjs'));

    const broken = `# T\n\n${START}\n\nirreplaceable paragraph\n\n---\n\n## S\n\n### E\n\n**Рішення:** t.\n`;
    for (const name of ['DECISIONS', 'LEARNING', 'BOOTSTRAP']) {
      await writeFile(join(dir, `docs/${name}.md`), broken);
    }

    const script = join(dir, 'scripts/generate-toc.mjs');
    for (const pass of [1, 2]) {
      const outcome = await promisify(execFile)(process.execPath, [script])
        .then(() => ({ code: 0, stderr: '' }))
        .catch((/** @type {{ code?: number, stderr?: string }} */ cause) => ({
          code: cause.code ?? 1,
          stderr: cause.stderr ?? '',
        }));

      expect(outcome.code, `pass ${pass}`).toBe(1);
      expect(outcome.stderr).toContain('exactly one TOC marker pair');
    }

    const survived = await readFile(join(dir, 'docs/DECISIONS.md'), 'utf8');
    expect(survived).toBe(broken);
  });
});
