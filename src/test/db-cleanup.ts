import { afterEach } from 'vitest';
import { db } from '../db/db.js';
import { truncateAllTablesSql } from './truncate-all.js';

/**
 * Truncates every app + Better Auth table after each test, so tests never
 * see data left behind by a previous test. Safe because this only ever
 * runs against TEST_DATABASE_URL (see env-setup.ts, which runs first).
 */
afterEach(async () => {
  await db.execute(truncateAllTablesSql);
});
