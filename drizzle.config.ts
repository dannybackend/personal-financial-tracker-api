/// <reference types="node" />

import { defineConfig } from 'drizzle-kit';
import { env as nodeEnv } from 'node:process';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL environment variable is required'),
});

const env = envSchema.parse(nodeEnv);

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
    url: env.DATABASE_URL,
  },
});
