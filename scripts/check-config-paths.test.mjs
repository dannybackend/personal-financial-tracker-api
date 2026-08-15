import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  globToRegExp,
  parseCodeRabbit,
  parseTsconfigInclude,
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
 * Builds a throwaway git repository containing the given files.
 *
 * The files are staged but never committed: `git ls-files` reports the index,
 * so staging is enough, and committing would need an identity this test has no
 * business configuring.
 *
 * @param {Record<string, string>} files - repo-relative path to contents
 * @returns {Promise<string>} path to the repository root
 */
async function scratchRepo(files) {
  const dir = await mkdtemp(join(tmpdir(), 'config-paths-'));
  scratch.push(dir);

  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });

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
});

describe('parseCodeRabbit', () => {
  it('reads path instructions and file patterns', () => {
    const { instructions, filePatterns } = parseCodeRabbit(HEALTHY_YAML);
    expect(instructions).toEqual(['src/**']);
    expect(filePatterns).toEqual(['**/AGENTS.md']);
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

describe('parseTsconfigInclude', () => {
  it('reads include past line and block comments', () => {
    expect(parseTsconfigInclude(`{
  // leading note
  /* and a block
     spanning lines */
  "include": ["scripts/**/*", "vitest.config.ts"]
}`)).toEqual(['scripts/**/*', 'vitest.config.ts']);
  });

  it('does not mistake // inside a string for a comment', () => {
    expect(parseTsconfigInclude('{ "include": ["https://example.com/x.ts"] }'))
      .toEqual(['https://example.com/x.ts']);
  });

  it('returns an empty list when include is absent', () => {
    expect(parseTsconfigInclude('{ "compilerOptions": { "strict": true } }')).toEqual([]);
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
      // Trailing comma: readable, and rejected by JSON.parse.
      'tsconfig.scripts.json': '{ "include": ["drizzle.config.ts",] }',
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

  it('fails when code_guidelines.enabled is dropped or turned off', async () => {
    const dir = await scratchRepo({
      '.coderabbit.yaml': HEALTHY_YAML.replace('enabled: true', 'enabled: false'),
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
