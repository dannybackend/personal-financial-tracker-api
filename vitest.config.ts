import { configDefaults, defineConfig } from 'vitest/config';

// Claude Code puts agent worktrees in .claude/worktrees/, i.e. a second full
// copy of src/ inside this checkout. Vitest's default `include` matched those
// too, so `npm test` silently ran a stale detached-HEAD copy of the
// application tests alongside the real ones - against the same
// TEST_DATABASE_URL - and reported the doubled count as the suite size. Git
// hides that directory through .git/info/exclude, which is local to one
// machine and never protected Vitest at all.
//
// This has to live inside each project: with `projects` defined, Vitest
// ignores a root-level `exclude` entirely - verified by loosening a project's
// include and watching 21 worktree tests reappear. Spread over the defaults
// rather than replacing them, which would drop Vitest's own exclusions.
const exclude = [...configDefaults.exclude, '.claude/**'];

export default defineConfig({
  test: {
    // Two projects because the suites need opposite things. The application
    // tests want a real database; the tooling tests under scripts/ touch no
    // I/O at all, and making them wait on Postgres - and pay a TRUNCATE after
    // every case - would gate the cheapest tests in the repository behind its
    // heaviest dependency.
    projects: [
      {
        test: {
          name: 'app',
          globals: true,
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude,
          globalSetup: './src/test/global-setup.ts',
          setupFiles: ['./src/test/env-setup.ts', './src/test/db-cleanup.ts'],
          sequence: { setupFiles: 'list' },
        },
      },
      {
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['scripts/**/*.test.mjs'],
          exclude,
        },
      },
    ],
    // db-cleanup.ts's afterEach truncates the whole shared TEST_DATABASE_URL -
    // fine for one test file, but two files running in parallel (Vitest's
    // default) would wipe each other's data. Force sequential instead.
    fileParallelism: false,
  },
});
