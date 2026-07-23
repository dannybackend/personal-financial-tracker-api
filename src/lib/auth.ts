import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { z } from 'zod';
import { db } from '../db/db.js';
import { users } from '../db/schema.js';
import {
  authUser,
  authSession,
  authAccount,
  authVerification,
} from '../db/auth-schema.js';

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string()
    .url('BETTER_AUTH_URL must be a valid URL')
    .refine((url) => !url.endsWith('/'), 'BETTER_AUTH_URL must not end with a trailing slash'),
});

const env = envSchema.parse(process.env);

/**
 * Better Auth instance.
 *
 * Configuration details:
 * - Database: Drizzle adapter using our shared postgres-js connection pool.
 * - Schema mapping: Better Auth's four core models are mapped to our prefixed
 *   `auth_*` tables so they don't collide with the financial-tracker tables.
 * - Auth provider: email + password (built-in).
 * - Session: stored server-side; the client receives an HttpOnly cookie
 *   (`better-auth.session_token`) that is never accessible from JavaScript.
 * - `databaseHooks.user.create.after` creates the matching domain `users`
 *   row as soon as Better Auth creates an `auth_user`, so a registered
 *   account can never exist without a financial-tracker profile
 *   (see docs/DECISIONS.md).
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
    },
  }),

  emailAndPassword: {
    enabled: true,
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db.insert(users).values({
            authUserId: user.id,
            email: user.email,
            name: user.name,
          });
        },
      },
    },
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // cache session in cookie for 5 minutes to reduce DB reads
    },
  },

  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
    },
  },
});

/** Inferred type of the authenticated user returned by Better Auth. */
export type AuthUser = typeof auth.$Infer.Session.user;

/** Inferred type of the session returned by Better Auth. */
export type AuthSession = typeof auth.$Infer.Session.session;
