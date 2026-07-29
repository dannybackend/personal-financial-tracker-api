import { config } from 'dotenv';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

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
 * TEST_DATABASE_URL's database exists, then applies pending migrations to it.
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
    await migrate(drizzle(client), { migrationsFolder: './src/db/migrations' });
  } finally {
    await client.end();
  }
}
