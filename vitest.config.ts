import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './src/test/global-setup.ts',
    setupFiles: ['./src/test/env-setup.ts', './src/test/db-cleanup.ts'],
  },
});
