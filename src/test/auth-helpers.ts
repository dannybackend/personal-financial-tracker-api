import { app } from '../app.js';

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Registers a fresh user and logs in, returning a `Cookie` header value
 * ready to attach to subsequent `app.request()` calls in tests that need
 * an authenticated session.
 */
export async function registerAndLogin(email: string, password = 'testpassword123'): Promise<string> {
  await app.request(jsonRequest('http://localhost/api/auth/sign-up/email', {
    email,
    password,
    name: 'Test User',
  }));

  const loginRes = await app.request(jsonRequest('http://localhost/api/auth/sign-in/email', {
    email,
    password,
  }));

  return loginRes.headers.getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}
