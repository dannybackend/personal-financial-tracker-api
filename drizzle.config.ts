import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

/**
 * Drizzle Kit configuration.
 * This configuration selects the migrations output directory, the database schema path,
 * the database dialect (PostgreSQL), and connection credentials.
 * It is exported as the default configuration for Drizzle Kit to read when running CLI commands.
 */
export default defineConfig({
  out: './src/db/migrations',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});

