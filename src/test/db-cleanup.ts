import { afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../db/db.js';

/**
 * Truncates every app + Better Auth table after each test, so tests never
 * see data left behind by a previous test. Safe because this only ever
 * runs against TEST_DATABASE_URL (see env-setup.ts, which runs first).
 */
afterEach(async () => {
  await db.execute(sql`
    TRUNCATE TABLE
      auth_verification, auth_account, auth_session, auth_user,
      budgets, transactions, categories, accounts, users
    CASCADE
  `);
});
