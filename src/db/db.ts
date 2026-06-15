import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import * as schema from './schema.js';
import * as authSchema from './auth-schema.js';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL environment variable is required'),
});

const env = envSchema.parse(process.env);

/**
 * Raw postgres.js connection client.
 * Used internally by Drizzle ORM.
 */
const client = postgres(env.DATABASE_URL);

/**
 * Drizzle ORM database instance.
 * Combines the application schema and the Better Auth schema so that all
 * tables are available on a single connection pool.
 *
 * Import this wherever you need to query the database.
 */
export const db = drizzle(client, {
  schema: {
    ...schema,
    ...authSchema,
  },
});
