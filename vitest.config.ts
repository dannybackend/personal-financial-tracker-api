import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './src/test/global-setup.ts',
    setupFiles: ['./src/test/env-setup.ts', './src/test/db-cleanup.ts'],
    sequence: { setupFiles: 'list' },
    // db-cleanup.ts's afterEach truncates the whole shared TEST_DATABASE_URL -
    // fine for one test file, but two files running in parallel (Vitest's
    // default) would wipe each other's data. Force sequential instead.
    fileParallelism: false,
  },
});
