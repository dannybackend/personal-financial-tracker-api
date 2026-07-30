import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { app } from '../app.js';
import { registerAndLogin } from '../test/auth-helpers.js';

const BASE_URL = 'http://localhost/accounts';

const accountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  type: z.enum(['cash', 'card', 'deposit']),
  currency: z.string(),
  createdAt: z.string(),
});

function authedRequest(method: string, url: string, cookie: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const validAccount = { name: 'Main Card', type: 'card' as const, currency: 'USD' };

describe('accounts CRUD - authentication', () => {
  it('rejects every route with 401 when there is no session', async () => {
    const noCookie = '';
    const getAll = await app.request(authedRequest('GET', BASE_URL, noCookie));
    const create = await app.request(authedRequest('POST', BASE_URL, noCookie, validAccount));
    const getOne = await app.request(authedRequest('GET', `${BASE_URL}/00000000-0000-0000-0000-000000000000`, noCookie));
    const update = await app.request(authedRequest('PATCH', `${BASE_URL}/00000000-0000-0000-0000-000000000000`, noCookie, { name: 'x' }));
    const remove = await app.request(authedRequest('DELETE', `${BASE_URL}/00000000-0000-0000-0000-000000000000`, noCookie));

    expect(getAll.status).toBe(401);
    expect(create.status).toBe(401);
    expect(getOne.status).toBe(401);
    expect(update.status).toBe(401);
    expect(remove.status).toBe(401);
  });
});

describe('POST /accounts', () => {
  it('creates an account scoped to the authenticated user', async () => {
    const cookie = await registerAndLogin('accounts-create@example.com');

    const res = await app.request(authedRequest('POST', BASE_URL, cookie, validAccount));

    expect(res.status).toBe(201);
    const account = accountSchema.parse(await res.json());
    expect(account.name).toBe('Main Card');
    expect(account.type).toBe('card');
    expect(account.currency).toBe('USD');
  });

  it('returns 422 when required fields are missing', async () => {
    const cookie = await registerAndLogin('accounts-invalid@example.com');

    const res = await app.request(authedRequest('POST', BASE_URL, cookie, { type: 'card' }));

    expect(res.status).toBe(422);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const cookie = await registerAndLogin('accounts-malformed@example.com');

    const res = await app.request(new Request(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: '{not json',
    }));

    expect(res.status).toBe(400);
  });
});

describe('GET /accounts', () => {
  it('only returns the authenticated user\'s own accounts', async () => {
    const ownerCookie = await registerAndLogin('accounts-owner@example.com');
    const otherCookie = await registerAndLogin('accounts-other@example.com');

    await app.request(authedRequest('POST', BASE_URL, ownerCookie, validAccount));
    await app.request(authedRequest('POST', BASE_URL, otherCookie, { name: 'Other Cash', type: 'cash', currency: 'EUR' }));

    const res = await app.request(authedRequest('GET', BASE_URL, ownerCookie));

    expect(res.status).toBe(200);
    const accountsList = z.array(accountSchema).parse(await res.json());
    expect(accountsList).toHaveLength(1);
    expect(accountsList[0]?.name).toBe('Main Card');
  });
});

describe('GET /accounts/:id', () => {
  it('returns the account when it belongs to the authenticated user', async () => {
    const cookie = await registerAndLogin('accounts-get-one@example.com');
    const created = accountSchema.parse(
      await (await app.request(authedRequest('POST', BASE_URL, cookie, validAccount))).json(),
    );

    const res = await app.request(authedRequest('GET', `${BASE_URL}/${created.id}`, cookie));

    expect(res.status).toBe(200);
    const account = accountSchema.parse(await res.json());
    expect(account.id).toBe(created.id);
  });

  it('returns 404, not 403, for another user\'s account (no enumeration)', async () => {
    const ownerCookie = await registerAndLogin('accounts-get-owner@example.com');
    const otherCookie = await registerAndLogin('accounts-get-other@example.com');
    const created = accountSchema.parse(
      await (await app.request(authedRequest('POST', BASE_URL, ownerCookie, validAccount))).json(),
    );

    const res = await app.request(authedRequest('GET', `${BASE_URL}/${created.id}`, otherCookie));

    expect(res.status).toBe(404);
  });

  it('returns 404 for a nonexistent id', async () => {
    const cookie = await registerAndLogin('accounts-get-missing@example.com');

    const res = await app.request(authedRequest('GET', `${BASE_URL}/00000000-0000-0000-0000-000000000000`, cookie));

    expect(res.status).toBe(404);
  });
});

describe('PATCH /accounts/:id', () => {
  it('updates the account when it belongs to the authenticated user', async () => {
    const cookie = await registerAndLogin('accounts-update@example.com');
    const created = accountSchema.parse(
      await (await app.request(authedRequest('POST', BASE_URL, cookie, validAccount))).json(),
    );

    const res = await app.request(authedRequest('PATCH', `${BASE_URL}/${created.id}`, cookie, { name: 'Renamed Card' }));

    expect(res.status).toBe(200);
    const updated = accountSchema.parse(await res.json());
    expect(updated.name).toBe('Renamed Card');
    expect(updated.type).toBe('card');
  });

  it('returns 404 for another user\'s account', async () => {
    const ownerCookie = await registerAndLogin('accounts-patch-owner@example.com');
    const otherCookie = await registerAndLogin('accounts-patch-other@example.com');
    const created = accountSchema.parse(
      await (await app.request(authedRequest('POST', BASE_URL, ownerCookie, validAccount))).json(),
    );

    const res = await app.request(authedRequest('PATCH', `${BASE_URL}/${created.id}`, otherCookie, { name: 'Hijacked' }));

    expect(res.status).toBe(404);
  });

  it('returns 422 for an empty update body', async () => {
    const cookie = await registerAndLogin('accounts-patch-empty@example.com');
    const created = accountSchema.parse(
      await (await app.request(authedRequest('POST', BASE_URL, cookie, validAccount))).json(),
    );

    const res = await app.request(authedRequest('PATCH', `${BASE_URL}/${created.id}`, cookie, {}));

    expect(res.status).toBe(422);
  });
});

describe('DELETE /accounts/:id', () => {
  it('deletes the account when it belongs to the authenticated user', async () => {
    const cookie = await registerAndLogin('accounts-delete@example.com');
    const created = accountSchema.parse(
      await (await app.request(authedRequest('POST', BASE_URL, cookie, validAccount))).json(),
    );

    const res = await app.request(authedRequest('DELETE', `${BASE_URL}/${created.id}`, cookie));
    expect(res.status).toBe(204);

    const getRes = await app.request(authedRequest('GET', `${BASE_URL}/${created.id}`, cookie));
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for another user\'s account and does not delete it', async () => {
    const ownerCookie = await registerAndLogin('accounts-delete-owner@example.com');
    const otherCookie = await registerAndLogin('accounts-delete-other@example.com');
    const created = accountSchema.parse(
      await (await app.request(authedRequest('POST', BASE_URL, ownerCookie, validAccount))).json(),
    );

    const res = await app.request(authedRequest('DELETE', `${BASE_URL}/${created.id}`, otherCookie));
    expect(res.status).toBe(404);

    const getRes = await app.request(authedRequest('GET', `${BASE_URL}/${created.id}`, ownerCookie));
    expect(getRes.status).toBe(200);
  });
});
