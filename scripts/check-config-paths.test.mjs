import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  globToRegExp,
  parseCodeRabbit,
  parseTsconfigPaths,
  tsconfigGlobToRegExp,
  parseWorkflow,
  checkCiSurface,
  documentNames,
  packageScripts,
} from './check-config-paths.mjs';

// Absolute, because the CLI cases run the script with `cwd` pointing at a
// throwaway repository — a relative path would resolve against that one.
const SCRIPT = resolve('scripts/check-config-paths.mjs');

/**
 * Temp repositories created by the CLI tests, removed once they have run.
 *
 * @type {string[]}
 */
const scratch = [];

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

/**
 * A CI surface that satisfies the workflow/prose invariant, so that tests about
 * globs and tsconfig coverage do not have to model the whole repository.
 *
 * Supplied by default and overridable per test: a case that means to exercise
 * the CI-surface check passes its own version of these. Without a default, every
 * unrelated fixture would carry six files it does not care about, and the first
 * person to add a test would delete the check instead.
 *
 * @type {Record<string, string>}
 */
const HEALTHY_CI = {
  '.github/workflows/ci.yml': [
    'jobs:',
    '  config-paths:',
    '    steps:',
    '      - run: npm run check:config-paths',
    '  ci:',
    '    steps:',
    '      - run: npm test',
  ].join('\n'),
  'package.json': JSON.stringify({
    scripts: { 'check:config-paths': 'node scripts/check-config-paths.mjs', test: 'vitest run' },
  }),
  'CONTRIBUTING.md': 'Jobs: `config-paths` and `ci`. Runs `npm run check:config-paths`.',
  '.github/pull_request_template.md': '- [ ] `npm run check:config-paths` passes',
};

/**
 * Builds a throwaway git repository containing the given files.
 *
 * The files are staged but never committed: `git ls-files` reports the index,
 * so staging is enough, and committing would need an identity this test has no
 * business configuring.
 *
 * @param {Record<string, string>} overrides - repo-relative path to contents
 * @returns {Promise<string>} path to the repository root
 */
async function scratchRepo(overrides) {
  const files = { ...HEALTHY_CI, ...overrides };
  const dir = await mkdtemp(join(tmpdir(), 'config-paths-'));
  scratch.push(dir);

  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });

  // Pinned away from the developer's git configuration, because two of its
  // settings decide what these tests observe: `core.excludesFile`, since the
  // script calls `ls-files --exclude-standard` and a global ignore would hide
  // a file the test just created, and `core.quotepath`, whose default is the
  // exact behaviour the non-ASCII case below exists to pin. Inherited, either
  // would make a test pass or fail by machine rather than by code.
  //
  // Written into the repository rather than passed as `-c` on `init`: the
  // later `git add` here, and the `git ls-files` inside the child process
  // under test, are separate invocations that would each inherit the global
  // value again.
  /** @type {[string, string][]} */
  const pins = [['core.excludesFile', ''], ['core.quotepath', 'true']];
  for (const [key, value] of pins) {
    execFileSync('git', ['config', key, value], { cwd: dir, stdio: 'ignore' });
  }

  for (const [name, contents] of Object.entries(files)) {
    const full = join(dir, name);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, contents);
  }

  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

/**
 * Runs the script as a child process, the way npm and CI do.
 *
 * @param {string} cwd - repository to run in
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>} outcome
 */
async function runCli(cwd) {
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [SCRIPT], { cwd });
    return { code: 0, stdout, stderr };
  } catch (cause) {
    const error = /** @type {{ code?: number, stdout?: string, stderr?: string }} */ (cause);
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

/** A config whose every pattern resolves, for the cases that need a clean base. */
const HEALTHY_YAML = `language: "uk"

reviews:
  path_instructions:
    - path: "src/**"
      instructions: "anything"

knowledge_base:
  code_guidelines:
    enabled: true
    filePatterns:
      - "**/AGENTS.md"
`;

const APP_TSCONFIG = '{ "include": ["src/**/*"] }';
const SCRIPTS_TSCONFIG = '{\n  // a comment, because both real configs carry them\n  "include": ["drizzle.config.ts"]\n}';

describe('globToRegExp', () => {
  it('expands ** across path separators', () => {
    expect(globToRegExp('src/**').test('src/routes/accounts.ts')).toBe(true);
    expect(globToRegExp('src/**/*').test('src/app.ts')).toBe(true);
  });

  it('keeps * inside a single segment', () => {
    expect(globToRegExp('src/*.ts').test('src/app.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/routes/app.ts')).toBe(false);
  });

  it('treats a leading **/ as an optional prefix', () => {
    const matcher = globToRegExp('**/API-CONVENTIONS.md');
    expect(matcher.test('docs/API-CONVENTIONS.md')).toBe(true);
    expect(matcher.test('API-CONVENTIONS.md')).toBe(true);
  });

  it('escapes the dot so a pattern cannot match a name it does not spell', () => {
    // The bug this guards: an unescaped `.` matches any character, so a
    // pattern naming a deleted file keeps matching a differently-named one
    // and the check reports it as live.
    expect(globToRegExp('drizzle.config.ts').test('drizzleXconfig.ts')).toBe(false);
    expect(globToRegExp('drizzle.config.ts').test('drizzle.config.ts')).toBe(true);
  });

  it('anchors, so a pattern does not match a longer path that contains it', () => {
    expect(globToRegExp('src/db/db.ts').test('other/src/db/db.ts')).toBe(false);
  });

  it('leaves other characters, including spaces, literal', () => {
    expect(globToRegExp('a b/*.ts').test('a b/x.ts')).toBe(true);
  });

  it('treats ? as one character inside a segment', () => {
    expect(globToRegExp('src/a?.ts').test('src/ab.ts')).toBe(true);
    expect(globToRegExp('src/a?.ts').test('src/a.ts')).toBe(false);
    expect(globToRegExp('src/a?.ts').test('src/a/b.ts')).toBe(false);
  });
});

describe('parseCodeRabbit', () => {
  it('reads path instructions and file patterns', () => {
    const { instructions, filePatterns } = parseCodeRabbit(HEALTHY_YAML);
    expect(instructions).toEqual(['src/**']);
    expect(filePatterns).toEqual(['**/AGENTS.md']);
  });

  it('reads list items that sit level with their key', () => {
    // YAML allows a sequence at its key's own indentation, and it is a common
    // house style. An earlier revision read the items as being outside the
    // block, lost every instruction, and failed the build over formatting.
    expect(parseCodeRabbit(`reviews:
  path_instructions:
  - path: "src/**"
    instructions: "anything"
`).instructions).toEqual(['src/**']);

    expect(parseCodeRabbit(`path_instructions:
- path: "src/**"
`).instructions).toEqual(['src/**']);
  });

  it('still stops collecting at the next key', () => {
    // The other half of the same change: level-with items belong to the block,
    // a mapping line at that indentation ends it.
    expect(parseCodeRabbit(`path_instructions:
- path: "src/**"
docstrings:
- path: "not-an-instruction/**"
`).instructions).toEqual(['src/**']);
  });

  it('does not read a block scalar as structure', () => {
    // An `instructions:` value may run to 20,000 characters, so it becomes a
    // `|` block the moment it outgrows one line — and an example `- path:`
    // written inside it was collected as a real instruction, then failed the
    // build naming a pattern that exists only inside a quoted string.
    const { instructions } = parseCodeRabbit(`reviews:
  path_instructions:
    - path: "src/**"
      instructions: |
        Write entries like this:
        - path: "src/config/**"

        Note the blank line above stays inside this value.
    - path: "src/db/**"
      instructions: "short one"
`);
    expect(instructions).toEqual(['src/**', 'src/db/**']);
  });

  it('ignores commented-out patterns', () => {
    // This config explains its own history in comments, and the pattern that
    // caused all this — `src/config/**` — is named in one of them. Checking a
    // tombstone would fail the build forever for a rule nobody applies.
    const { instructions } = parseCodeRabbit(`reviews:
  path_instructions:
    # - path: "src/config/**"
    - path: "src/**"
      instructions: "anything"
`);
    expect(instructions).toEqual(['src/**']);
  });

  it('reads code_guidelines.enabled only inside its own block', () => {
    // `enabled` is a common key in this config format; one belonging to some
    // other section must not be mistaken for the guideline switch.
    expect(parseCodeRabbit(HEALTHY_YAML).guidelinesEnabled).toBe(true);
    expect(parseCodeRabbit(`reviews:
  auto_review:
    enabled: true
  path_instructions:
    - path: "src/**"
`).guidelinesEnabled).toBe(null);
  });

  it('reads a pattern that carries a trailing comment', () => {
    // The regression this locks: an anchored match against a line ending in
    // ` # TODO` failed outright, so annotating an entry removed it from the
    // check while the build stayed green. A guard disarmed by a comment is
    // the exact failure this script exists to prevent, aimed at itself.
    const { instructions } = parseCodeRabbit(`reviews:
  path_instructions:
    - path: "src/config/**" # TODO: does this still exist?
      instructions: "anything"
`);
    expect(instructions).toEqual(['src/config/**']);
  });

  it('leaves a # inside a quoted pattern alone', () => {
    const { instructions } = parseCodeRabbit(`reviews:
  path_instructions:
    - path: "src/od#d/**"
`);
    expect(instructions).toEqual(['src/od#d/**']);
  });

  it('stops the filePatterns list at the next key', () => {
    const { filePatterns } = parseCodeRabbit(`knowledge_base:
  code_guidelines:
    filePatterns:
      - "**/AGENTS.md"
  learnings: auto
  - not a pattern
`);
    expect(filePatterns).toEqual(['**/AGENTS.md']);
  });

  it('returns nothing for a config written in flow style', () => {
    // Not a supported form — the point is that it reads as empty rather than
    // as something wrong, which is why `run` fails on an empty parse instead
    // of passing.
    const { instructions } = parseCodeRabbit('reviews: { path_instructions: [{ path: "src/**" }] }');
    expect(instructions).toEqual([]);
  });
});

describe('tsconfigGlobToRegExp', () => {
  it('expands a bare directory the way tsc does', () => {
    expect(tsconfigGlobToRegExp('scripts').test('scripts/a.mjs')).toBe(true);
    expect(tsconfigGlobToRegExp('.').test('drizzle.config.ts')).toBe(true);
  });

  it('decides directory-ness on the last segment, not the whole pattern', () => {
    // The regression this locks: testing the whole pattern let a wildcard
    // earlier in the path disqualify it, so the ordinary way to write "a
    // `dist` anywhere" matched the path `dist` and nothing beneath it.
    const matcher = tsconfigGlobToRegExp('**/generated');
    expect(matcher.test('generated/x.ts')).toBe(true);
    expect(matcher.test('nested/generated/x.ts')).toBe(true);
  });

  it('leaves a pattern whose last segment is itself a wildcard alone', () => {
    expect(tsconfigGlobToRegExp('src/**/*').test('src/app.ts')).toBe(true);
    expect(tsconfigGlobToRegExp('src/**').test('src/routes/a.ts')).toBe(true);
    expect(tsconfigGlobToRegExp('*.config.ts').test('vitest.config.ts')).toBe(true);
  });

  it('treats a last segment carrying an extension as a file', () => {
    expect(tsconfigGlobToRegExp('drizzle.config.ts').test('drizzle.config.ts')).toBe(true);
    expect(tsconfigGlobToRegExp('drizzle.config.ts').test('drizzle.config.ts/x')).toBe(false);
  });
});

describe('parseTsconfigPaths', () => {
  it('reads include past line and block comments', () => {
    expect(parseTsconfigPaths(`{
  // leading note
  /* and a block
     spanning lines */
  "include": ["scripts/**/*", "vitest.config.ts"]
}`).include).toEqual(['scripts/**/*', 'vitest.config.ts']);
  });

  it('does not mistake // inside a string for a comment', () => {
    expect(parseTsconfigPaths('{ "include": ["https://example.com/x.ts"] }').include)
      .toEqual(['https://example.com/x.ts']);
  });

  it('accepts trailing commas, because tsc does', () => {
    // Verified against the pinned compiler: `tsc -p` exits 0 on a tsconfig
    // with trailing commas in both an object and an array. Rejecting one here
    // would redden CI over a config TypeScript is perfectly happy with.
    expect(parseTsconfigPaths(`{
  "compilerOptions": { "strict": true, },
  "include": ["a.ts", "b.ts",],
}`).include).toEqual(['a.ts', 'b.ts']);
  });

  it('leaves a comma inside a string alone', () => {
    // The reason trailing commas are removed by a walk and not by
    // /,(?=\\s*[}\\]])/ — that pattern reaches into the value below.
    expect(parseTsconfigPaths('{ "include": ["weird,}name.ts"] }').include)
      .toEqual(['weird,}name.ts']);
  });

  it('reads files and exclude alongside include', () => {
    const parsed = parseTsconfigPaths(`{
  "files": ["drizzle.config.ts"],
  "include": ["src/**/*"],
  "exclude": ["src/generated/**"]
}`);
    expect(parsed).toEqual({
      files: ['drizzle.config.ts'],
      include: ['src/**/*'],
      exclude: ['src/generated/**'],
    });
  });

  it('keeps a backslash-escaped quote inside a string', () => {
    // `indexOf('"')` ended the string early, after which its tail was scanned
    // as structure — a `//` in it elided as a comment, a comma before `}`
    // taken for punctuation.
    expect(parseTsconfigPaths('{ "include": ["a\\"//b.ts", "c.ts"] }').include)
      .toEqual(['a"//b.ts', 'c.ts']);
  });

  it('returns empty lists when the keys are absent or not arrays', () => {
    expect(parseTsconfigPaths('{ "compilerOptions": { "strict": true } }'))
      .toEqual({ include: [], files: [], exclude: [] });
    // A non-array `include`, and a non-string entry inside one: both are
    // filtered rather than trusted into a matcher that would throw.
    expect(parseTsconfigPaths('{ "include": "src/**/*", "files": ["a.ts", 42] }'))
      .toEqual({ include: [], files: ['a.ts'], exclude: [] });
  });
});

describe('the check as CI runs it', () => {
  it('passes when every pattern resolves and every root config is covered', async () => {
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML,
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': SCRIPTS_TSCONFIG,
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
    });

    const { code, stdout } = await runCli(dir);
    expect(code).toBe(0);
    expect(stdout).toContain('patterns checked');
  });

  it('fails on a path instruction that matches nothing', async () => {
    // The original bug, reproduced: `src/config/**` against a repo with no
    // such directory. If this ever passes, the check has stopped checking.
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML.replace('src/**', 'src/config/**'),
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': SCRIPTS_TSCONFIG,
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
    });

    const { code, stderr } = await runCli(dir);
    expect(code).toBe(1);
    expect(stderr).toContain('"src/config/**" matches no tracked file');
  });

  it('fails on a guideline pattern that matches nothing', async () => {
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML.replace('**/AGENTS.md', 'docs/API-CONVENTIONS.md'),
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': SCRIPTS_TSCONFIG,
      'src/app.ts': '',
      'drizzle.config.ts': '',
    });

    const { code, stderr } = await runCli(dir);
    expect(code).toBe(1);
    expect(stderr).toContain('code_guidelines.filePatterns');
  });

  it('fails on a root config in neither tsconfig', async () => {
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML,
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': SCRIPTS_TSCONFIG,
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
      // The next config to land at the root, escaping typecheck exactly the
      // way vitest.config.ts and drizzle.config.ts did.
      'playwright.config.ts': '',
    });

    const { code, stderr } = await runCli(dir);
    expect(code).toBe(1);
    expect(stderr).toContain('playwright.config.ts is in no tsconfig');
  });

  it('matches a non-ASCII filename instead of reporting it missing', async () => {
    // `git ls-files` without -z applies core.quotepath, which defaults on and
    // renders this path as "docs/\320\232..." — quotes and octal escapes
    // included. Every pattern that should match it would then report a file
    // that plainly exists as missing, and this repository's docs are Ukrainian.
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML.replace('**/AGENTS.md', 'docs/**'),
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': SCRIPTS_TSCONFIG,
      'src/app.ts': '',
      'docs/Конвенції.md': '',
      'drizzle.config.ts': '',
    });

    const { code, stdout } = await runCli(dir);
    expect(code).toBe(0);
    expect(stdout).toContain('patterns checked');
  });

  it('sees a root config that has not been staged yet', async () => {
    // The index alone would answer "every root config is type checked" about a
    // repository where the offending file exists but is not added — the one
    // file the check is for being the one it cannot see.
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML,
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': SCRIPTS_TSCONFIG,
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
    });
    await writeFile(join(dir, 'playwright.config.ts'), '');

    const { code, stderr } = await runCli(dir);
    expect(code).toBe(1);
    expect(stderr).toContain('playwright.config.ts is in no tsconfig');
  });

  it('names a malformed tsconfig as unparseable, not unreadable', async () => {
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML,
      'tsconfig.json': APP_TSCONFIG,
      // Readable, and genuinely broken — not a trailing comma, which tsc
      // accepts and so does this reader.
      'tsconfig.scripts.json': '{ "include": ["drizzle.config.ts" }',
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
    });

    const { code, stderr } = await runCli(dir);
    expect(code).toBe(1);
    expect(stderr).toContain('not parseable as JSON-with-comments');
    // The follow-on false accusation: with a partial include set, a file the
    // broken config does list would be reported as escaping typecheck too.
    expect(stderr).not.toContain('is in no tsconfig');
  });

  it('accepts a tsconfig whose trailing commas tsc would accept', async () => {
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML,
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': '{\n  "include": ["drizzle.config.ts",],\n}',
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
    });

    const { code } = await runCli(dir);
    expect(code).toBe(0);
  });

  it('does not call a file covered when exclude takes it back out', async () => {
    // `exclude` filters what `include` found, so reading `include` alone said
    // "type checked" about a file no tsc invocation compiles — silence, which
    // is the one outcome this script exists to prevent.
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML,
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json':
        '{ "include": ["drizzle.config.ts"], "exclude": ["drizzle.config.ts"] }',
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
    });

    const { code, stderr } = await runCli(dir);
    expect(code).toBe(1);
    expect(stderr).toContain('drizzle.config.ts is in no tsconfig program');
  });

  it('counts a files entry written with a ./ prefix', async () => {
    // `./drizzle.config.ts` and `drizzle.config.ts` are the same file to tsc,
    // and a string comparison between them said otherwise — reporting a config
    // as never type checked while the compiler was compiling it.
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML,
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': '{ "files": ["./drizzle.config.ts"] }',
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
    });

    const { code } = await runCli(dir);
    expect(code).toBe(0);
  });

  it('reads a bare directory in include the way tsc does', async () => {
    // A pattern with no wildcard and no extension names a directory and covers
    // everything under it. Read as a literal filename it matched nothing, and
    // a normally written config looked as though it covered no root file.
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML,
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': '{ "include": ["."] }',
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
    });

    const { code } = await runCli(dir);
    expect(code).toBe(0);
  });

  it('counts a file named in files, which exclude does not filter', async () => {
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML,
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json':
        '{ "files": ["drizzle.config.ts"], "exclude": ["drizzle.config.ts"] }',
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
    });

    const { code } = await runCli(dir);
    expect(code).toBe(0);
  });

  it('fails when the knowledge_base block is deleted outright', async () => {
    // The regression this locks: the guard used to fire only when the key was
    // declared and unreadable, so removing the block entirely left every
    // remaining pattern resolving and the run reporting success — the original
    // two-month bug re-entering through the checker's own blind spot.
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML.slice(0, HEALTHY_YAML.indexOf('knowledge_base:')),
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': SCRIPTS_TSCONFIG,
      'src/app.ts': '',
      'drizzle.config.ts': '',
    });

    const { code, stderr } = await runCli(dir);
    expect(code).toBe(1);
    expect(stderr).toContain('lists no code_guidelines.filePatterns');
  });

  // Two cases, not one: `enabled: false` and a missing key reach the failure
  // through different branches of `parseCodeRabbit` — `false` and `null` — and
  // an earlier revision of this test named both while exercising only the
  // first, leaving the branch that a plain deletion takes uncovered.
  it.each([
    ['turned off', HEALTHY_YAML.replace('enabled: true', 'enabled: false')],
    ['dropped entirely', HEALTHY_YAML.replace('    enabled: true\n', '')],
  ])('fails when code_guidelines.enabled is %s', async (_name, yaml) => {
    const dir = await scratchRepo({
      '.coderabbit.yaml': yaml,
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': SCRIPTS_TSCONFIG,
      'src/app.ts': '',
      'AGENTS.md': '',
      'drizzle.config.ts': '',
    });

    const { code, stderr } = await runCli(dir);
    expect(code).toBe(1);
    expect(stderr).toContain('does not set code_guidelines.enabled: true');
  });

  it('fails rather than passes when it can parse no instructions at all', async () => {
    const dir = await scratchRepo({
      '.coderabbit.yaml': 'reviews: { path_instructions: [{ path: "src/**" }] }\n',
      'tsconfig.json': APP_TSCONFIG,
      'tsconfig.scripts.json': SCRIPTS_TSCONFIG,
      'src/app.ts': '',
    });

    const { code, stderr } = await runCli(dir);
    expect(code).toBe(1);
    expect(stderr).toContain('parsed 0 path instructions');
  });
});

describe('parseWorkflow', () => {
  const WORKFLOW = [
    'name: CI',
    'on:',
    '  pull_request:',
    'jobs:',
    '  markers:',
    '    steps:',
    '      - run: npm run check:markers',
    '  ci:',
    '    services:',
    '      postgres:',
    '    steps:',
    '      - run: npm ci',
    '      - run: npm run typecheck',
  ].join('\n');

  it('reads the job ids and the npm scripts the workflow runs', () => {
    expect(parseWorkflow(WORKFLOW)).toEqual({
      jobs: ['markers', 'ci'],
      scripts: ['check:markers', 'typecheck'],
    });
  });

  it('does not mistake a nested key for a job', () => {
    // `postgres:` sits four spaces deep under `services:`. Counting it a job
    // would demand CONTRIBUTING.md document a job that does not exist.
    expect(parseWorkflow(WORKFLOW).jobs).not.toContain('postgres');
  });

  it('stops at the end of the jobs block', () => {
    const trailing = `${WORKFLOW}\npermissions:\n  contents: read\n`;
    expect(parseWorkflow(trailing).jobs).toEqual(['markers', 'ci']);
  });

  it('ignores a job that is only mentioned in a comment', () => {
    const commented = WORKFLOW.replace('  ci:', '  # ci:\n  ci:');
    expect(parseWorkflow(commented).jobs).toEqual(['markers', 'ci']);
  });
});

describe('checkCiSurface', () => {
  const WORKFLOW = { jobs: ['config-paths'], scripts: ['check:config-paths', 'test'] };
  const PACKAGE = { 'check:config-paths': '...', test: '...' };

  /** @returns {Map<string, string>} docs that all name the check */
  const healthyDocs = () => new Map([
    ['CONTRIBUTING.md', 'job `config-paths` runs `npm run check:config-paths`'],
    ['.github/pull_request_template.md', '`npm run check:config-paths` passes'],
  ]);

  it('passes when the workflow and the prose agree', () => {
    /** @type {string[]} */
    const problems = [];
    checkCiSurface(WORKFLOW, PACKAGE, healthyDocs(), problems);
    expect(problems).toEqual([]);
  });

  it('flags a check CI runs that a document never names', () => {
    // The finding this invariant was built for: adding `check:toc` to ci.yml
    // left the pull request template, and both READMEs, silently short.
    /** @type {string[]} */
    const problems = [];
    const docs = healthyDocs();
    checkCiSurface(
      { jobs: ['config-paths'], scripts: ['check:config-paths', 'check:toc'] },
      { ...PACKAGE, 'check:toc': '...' },
      docs,
      problems,
    );

    expect(problems).toHaveLength(docs.size);
    expect(problems[0]).toContain('check:toc');
    expect(problems[0]).toContain('never names it');
  });

  it('flags a check a document names that CI does not run', () => {
    /** @type {string[]} */
    const problems = [];
    const docs = healthyDocs();
    docs.set('README.md', 'runs `npm run check:config-paths` and `npm run check:removed`');
    checkCiSurface(WORKFLOW, PACKAGE, docs, problems);

    expect(problems.join('\n')).toContain('names `check:removed`');
  });

  it('flags a job CONTRIBUTING.md does not name', () => {
    /** @type {string[]} */
    const problems = [];
    checkCiSurface(
      { jobs: ['config-paths', 'brand-new'], scripts: ['check:config-paths'] },
      PACKAGE,
      healthyDocs(),
      problems,
    );

    expect(problems.join('\n')).toContain('defines job `brand-new`');
  });

  it('flags a short job name that prose merely contains', () => {
    // The defect this pins: `ci` is a substring of "decisions", so an
    // `includes` check could never report the repository's main job as
    // undocumented — and the case above passes anyway, because `brand-new` is
    // too distinctive to collide. A test that only proves the easy half of a
    // rule certifies a guarantee the code does not give.
    /** @type {string[]} */
    const problems = [];
    const docs = healthyDocs();
    docs.set(
      'CONTRIBUTING.md',
      'Runs `npm run check:config-paths`. See `.github/workflows/ci.yml`, and ' +
      'docs/DECISIONS.md for architectural decisions. Install with `npm ci`.',
    );
    checkCiSurface({ jobs: ['ci'], scripts: ['check:config-paths'] }, PACKAGE, docs, problems);

    expect(problems.join('\n')).toContain('defines job `ci`');
  });

  it('accepts a job named as a code span of its own', () => {
    /** @type {string[]} */
    const problems = [];
    const docs = healthyDocs();
    docs.set('CONTRIBUTING.md', 'The `ci` job runs `npm run check:config-paths`.');
    checkCiSurface({ jobs: ['ci'], scripts: ['check:config-paths'] }, PACKAGE, docs, problems);

    expect(problems).toEqual([]);
  });

  it('does not count a name that only appears inside a fenced block', () => {
    // Fenced blocks are dropped before the spans are read; leaving them in
    // desynchronised the backtick pairing and hid every real span after the
    // first fence.
    /** @type {string[]} */
    const problems = [];
    const docs = healthyDocs();
    docs.set('CONTRIBUTING.md', '```bash\nnpm run check:config-paths\n```\n\nNothing else.');
    checkCiSurface(WORKFLOW, PACKAGE, docs, problems);

    expect(problems.join('\n')).toContain('never names it');
  });

  it('flags a workflow step calling an npm script package.json does not define', () => {
    /** @type {string[]} */
    const problems = [];
    checkCiSurface(WORKFLOW, { 'check:config-paths': '...' }, healthyDocs(), problems);
    expect(problems.join('\n')).toContain('`npm run test`, which package.json does not define');
  });

  it('treats parsing nothing as divergence, not as success', () => {
    // Same gate as the rest of this script: a reader that silently understands
    // nothing would pass forever while checking nothing.
    /** @type {string[]} */
    const problems = [];
    checkCiSurface({ jobs: [], scripts: [] }, PACKAGE, healthyDocs(), problems);
    expect(problems.join('\n')).toContain('the reader and the workflow have diverged');
  });
});

describe('documentNames', () => {
  // Tested directly because every earlier version of this rule passed the suite
  // while being wrong: `includes` matched `ci` inside "decisions", and token
  // boundaries matched it inside `` `npm ci` ``. Both were caught by hand, not
  // here.
  /** @param {string} text */
  const names = (text) => documentNames(text).spans;

  it('collects a span as the exact name it states', () => {
    expect(names('The `ci` job runs `npm run check:toc`.'))
      .toEqual(new Set(['ci', 'npm run check:toc']));
  });

  it('does not state a name that only appears inside a word', () => {
    expect(names('See DECISIONS for architectural decisions.').has('ci')).toBe(false);
  });

  it('does not state a name carried by a longer span', () => {
    // Both of these contain `ci` bounded by punctuation, which is why the
    // boundary-based rule that preceded this one still passed.
    const stated = names('Install with `npm ci`, see `.github/workflows/ci.yml`.');
    expect(stated.has('ci')).toBe(false);
    expect(stated).toEqual(new Set(['npm ci', '.github/workflows/ci.yml']));
  });

  it('ignores spans inside a fenced block', () => {
    // A name in a worked example is not a claim about CI. Leaving fences in also
    // desynchronised the backtick pairing for everything after them.
    expect(names('```text\n`check:removed`\n```\n\nReal: `check:toc`.'))
      .toEqual(new Set(['check:toc']));
  });

  it('sees spans that follow a fenced block', () => {
    const text = '```bash\nnpm run lint\n```\n\nThen `check:toc` and `config-paths`.';
    expect(names(text)).toEqual(new Set(['check:toc', 'config-paths']));
  });

  it('reports an unbalanced fence rather than swallowing the rest', () => {
    const unclosed = '```text\nexample\n\nThen `check:toc`.';
    expect(documentNames(unclosed).unbalancedFence).toBe(true);
    expect(documentNames('```a\nx\n```\n`y`').unbalancedFence).toBe(false);
  });

  it('ignores an empty or whitespace-only span', () => {
    expect(names('a `  ` b')).toEqual(new Set());
  });
});

describe('packageScripts', () => {
  it('reads the scripts map', () => {
    expect(packageScripts('{"scripts":{"test":"vitest run"}}')).toEqual({ test: 'vitest run' });
  });

  it('treats a manifest with no scripts key as having none', () => {
    expect(packageScripts('{"name":"x"}')).toEqual({});
  });

  it.each([
    ['an array', '[]'],
    ['a string', '"nope"'],
    ['null', 'null'],
  ])('refuses a manifest that parses to %s', (_label, source) => {
    expect(() => packageScripts(source)).toThrow('does not parse to an object');
  });

  it('refuses a scripts key that is not an object', () => {
    // Without this the value falls through to `{}` and every script in the
    // workflow reports as undefined — a page of confident complaints pointing at
    // ci.yml instead of at the manifest that is actually malformed.
    expect(() => packageScripts('{"scripts":["test"]}')).toThrow('not an object');
  });
});
