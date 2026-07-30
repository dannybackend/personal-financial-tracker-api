import { config } from 'dotenv';
import { z } from 'zod';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { truncateAllTablesSql } from './truncate-all.js';

const testDatabaseUrlSchema = z.string().regex(
  /^postgres(ql)?:\/\//,
  'TEST_DATABASE_URL must be a postgres:// or postgresql:// URL',
);

const databaseNameSchema = z.string().regex(
  /^[A-Za-z_][A-Za-z0-9_]*$/,
  'database name must start with a letter or underscore',
);

/**
 * Refuses to continue if TEST_DATABASE_URL resolves to the same database as
 * DATABASE_URL - e.g. a copy-paste mistake in .env - since everything below
 * this point runs migrations and TRUNCATE ... CASCADE against it.
 */
function assertNotDevDatabase(testDatabaseUrl: string): void {
  const devDatabaseUrl = process.env.DATABASE_URL;
  if (!devDatabaseUrl) {
    return;
  }

  const test = new URL(testDatabaseUrl);
  const dev = new URL(devDatabaseUrl);

  const sameTarget = test.hostname === dev.hostname
    && (test.port || '5432') === (dev.port || '5432')
    && test.pathname === dev.pathname;

  if (sameTarget) {
    throw new Error(
      'TEST_DATABASE_URL points at the same database as DATABASE_URL - refusing to migrate/truncate it. Check .env for a copy-paste mistake.',
    );
  }
}

/**
 * Creates the test database if it doesn't exist yet. docker/init-test-db.sh
 * only runs on a fresh postgres_data volume, so an already-existing volume
 * (e.g. one created before that script existed) needs this fallback.
 */
async function ensureDatabaseExists(testDatabaseUrl: string): Promise<void> {
  const testDbName = databaseNameSchema.parse(new URL(testDatabaseUrl).pathname.slice(1));

  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = '/postgres';
  const adminClient = postgres(adminUrl.toString(), { max: 1 });

  try {
    const rows = await adminClient`SELECT 1 FROM pg_database WHERE datname = ${testDbName}`;
    if (rows.length === 0) {
      await adminClient`CREATE DATABASE ${adminClient(testDbName)}`;
    }
  } finally {
    await adminClient.end();
  }
}

/**
 * Runs once before the whole test run (not per test file): makes sure
 * TEST_DATABASE_URL's database exists, applies pending migrations, then
 * truncates every table. The truncate here (not just db-cleanup.ts's
 * afterEach) matters because afterEach only cleans up AFTER a test - if a
 * previous run was killed mid-test (Ctrl+C, crash) before its afterEach
 * could fire, leftover data would otherwise still be there when this run's
 * first test starts.
 */
export async function setup(): Promise<void> {
  config();

  const rawTestDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!rawTestDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL must be set (see .env.example) to run integration tests');
  }
  const testDatabaseUrl = testDatabaseUrlSchema.parse(rawTestDatabaseUrl);

  assertNotDevDatabase(testDatabaseUrl);
  await ensureDatabaseExists(testDatabaseUrl);

  const client = postgres(testDatabaseUrl, { max: 1 });
  try {
    const testDb = drizzle(client);
    await migrate(testDb, { migrationsFolder: './src/db/migrations' });
    await testDb.execute(truncateAllTablesSql);
  } finally {
    await client.end();
  }
}
