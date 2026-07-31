import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { auth } from '../lib/auth.js';
import { db } from '../db/db.js';
import { users, type User } from '../db/schema.js';

/** Hono environment for any route mounted behind `requireAuth`. */
export type AuthEnv = {
  Variables: {
    user: User;
  };
};

/**
 * Requires a valid Better Auth session, then resolves it to this app's
 * domain `users` row - `accounts`/`categories`/etc. all key off `users.id`,
 * not the Better Auth `auth_user.id` - and attaches it to the request
 * context as `user`.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const [profile] = await db
    .select()
    .from(users)
    .where(eq(users.authUserId, session.user.id));

  if (!profile) {
    // The onUserCreate hook (src/lib/auth.ts) should always create this row
    // right after Better Auth creates the auth_user. If it's missing, the
    // session itself is real but the account is in a broken state - fail
    // loudly rather than pretending this is an auth failure (see
    // docs/DECISIONS.md's dual-write note on this hook).
    throw new Error(`No users row for authUserId ${session.user.id} - onUserCreate hook may have failed`);
  }

  c.set('user', profile);
  await next();
});
