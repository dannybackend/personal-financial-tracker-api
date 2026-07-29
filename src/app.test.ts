import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { app } from './app.js';
import { db } from './db/db.js';
import { users } from './db/schema.js';
import { authUser } from './db/auth-schema.js';

const REGISTER_URL = 'http://localhost/api/auth/sign-up/email';
const LOGIN_URL = 'http://localhost/api/auth/sign-in/email';

const signUpResponseSchema = z.object({
  token: z.string().nullable(),
  user: z.object({ email: z.string() }),
});

const sessionResponseSchema = z.object({
  user: z.object({ email: z.string() }),
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/sign-up/email', () => {
  it('registers a new user and returns 200 with no auto-issued session', async () => {
    const res = await app.request(jsonRequest(REGISTER_URL, {
      email: 'register-test@example.com',
      password: 'testpassword123',
      name: 'Register Test',
    }));

    expect(res.status).toBe(200);
    const body = signUpResponseSchema.parse(await res.json());
    expect(body.token).toBeNull();
    expect(body.user.email).toBe('register-test@example.com');
  });

  it('creates a matching users row via the onUserCreate hook', async () => {
    await app.request(jsonRequest(REGISTER_URL, {
      email: 'hook-check@example.com',
      password: 'testpassword123',
      name: 'Hook Check',
    }));

    const rows = await db.select().from(users).where(eq(users.email, 'hook-check@example.com'));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Hook Check');
  });

  it('returns the same success shape for a duplicate email, without creating a second row', async () => {
    const email = 'duplicate-test@example.com';
    const payload = { email, password: 'testpassword123', name: 'Duplicate Test' };

    const first = await app.request(jsonRequest(REGISTER_URL, payload));
    expect(first.status).toBe(200);
    const firstBody = signUpResponseSchema.parse(await first.json());
    expect(firstBody.token).toBeNull();
    expect(firstBody.user.email).toBe(email);

    const second = await app.request(jsonRequest(REGISTER_URL, payload));
    expect(second.status).toBe(200);
    const secondBody = signUpResponseSchema.parse(await second.json());
    expect(secondBody.token).toBeNull();
    expect(secondBody.user.email).toBe(email);

    const authRows = await db.select().from(authUser).where(eq(authUser.email, email));
    expect(authRows).toHaveLength(1);

    const profileRows = await db.select().from(users).where(eq(users.email, email));
    expect(profileRows).toHaveLength(1);
  });
});

// Better Auth's /sign-in/email customRule caps this at 5 attempts per 60s
// (src/lib/auth.ts) - keep this file's total sign-in calls comfortably
// under that, or later tests will flake with 429 instead of 200/401.
describe('POST /api/auth/sign-in/email', () => {
  it('logs in with correct credentials, sets a session cookie, and the cookie resolves via get-session', async () => {
    const email = 'login-test@example.com';
    const password = 'testpassword123';

    await app.request(jsonRequest(REGISTER_URL, { email, password, name: 'Login Test' }));
    const loginRes = await app.request(jsonRequest(LOGIN_URL, { email, password }));

    expect(loginRes.status).toBe(200);
    const setCookies = loginRes.headers.getSetCookie();
    expect(setCookies.some((cookie) => cookie.includes('better-auth.session_token'))).toBe(true);
    expect(setCookies.some((cookie) => cookie.includes('HttpOnly'))).toBe(true);

    const cookieHeader = setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
    const sessionRes = await app.request(new Request('http://localhost/api/auth/get-session', {
      headers: { Cookie: cookieHeader },
    }));

    const session = sessionResponseSchema.parse(await sessionRes.json());
    expect(session.user.email).toBe(email);
  });

  it('rejects invalid credentials with 401', async () => {
    const email = 'invalid-creds-test@example.com';
    await app.request(jsonRequest(REGISTER_URL, {
      email,
      password: 'correctpassword123',
      name: 'Invalid Creds Test',
    }));

    const res = await app.request(jsonRequest(LOGIN_URL, { email, password: 'wrongpassword123' }));

    expect(res.status).toBe(401);
  });
});
