import { config } from 'dotenv';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { truncateAllTablesSql } from './truncate-all.js';

/**
 * Creates the test database if it doesn't exist yet. docker/init-test-db.sh
 * only runs on a fresh postgres_data volume, so an already-existing volume
 * (e.g. one created before that script existed) needs this fallback.
 */
async function ensureDatabaseExists(testDatabaseUrl: string): Promise<void> {
  const testDbName = new URL(testDatabaseUrl).pathname.slice(1);

  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = '/postgres';
  const adminClient = postgres(adminUrl.toString(), { max: 1 });

  try {
    const rows = await adminClient`SELECT 1 FROM pg_database WHERE datname = ${testDbName}`;
    if (rows.length === 0) {
      await adminClient.unsafe(`CREATE DATABASE "${testDbName}"`);
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

  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL must be set (see .env.example) to run integration tests');
  }

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
