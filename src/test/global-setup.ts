import { config } from 'dotenv';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

/**
 * Runs once before the whole test run (not per test file): applies pending
 * migrations to TEST_DATABASE_URL, so the test database's schema is always
 * current without a separate manual `db:migrate` step against it.
 */
export default async function setup(): Promise<void> {
  config();

  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL must be set (see .env.example) to run integration tests');
  }

  const client = postgres(testDatabaseUrl, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: './src/db/migrations' });
  await client.end();
}
