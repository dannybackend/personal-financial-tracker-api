import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/db.js';
import { accounts } from '../db/schema.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';
import { parseBody, parseParam } from '../lib/validation.js';

const idParamSchema = z.uuid();

const createAccountSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['cash', 'card', 'deposit']),
  currency: z.string().min(1).max(10),
});

const updateAccountSchema = createAccountSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' },
);

export const accountsRoute = new Hono<AuthEnv>();

accountsRoute.use('*', requireAuth);

accountsRoute.post('/', async (c) => {
  const parsed = await parseBody(c, createAccountSchema);
  if ('error' in parsed) {
    return parsed.error;
  }

  const user = c.get('user');
  const [account] = await db
    .insert(accounts)
    .values({ ...parsed.data, userId: user.id })
    .returning();

  return c.json(account, 201);
});

accountsRoute.get('/', async (c) => {
  const user = c.get('user');
  const rows = await db.select().from(accounts).where(eq(accounts.userId, user.id));
  return c.json(rows, 200);
});

accountsRoute.get('/:id', async (c) => {
  const parsedId = parseParam(c, idParamSchema, c.req.param('id'));
  if ('error' in parsedId) {
    return parsedId.error;
  }

  const user = c.get('user');
  const id = parsedId.data;

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)));

  if (!account) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(account, 200);
});

accountsRoute.patch('/:id', async (c) => {
  const parsedId = parseParam(c, idParamSchema, c.req.param('id'));
  if ('error' in parsedId) {
    return parsedId.error;
  }

  const parsed = await parseBody(c, updateAccountSchema);
  if ('error' in parsed) {
    return parsed.error;
  }

  const user = c.get('user');
  const id = parsedId.data;

  const [updated] = await db
    .update(accounts)
    .set(parsed.data)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)))
    .returning();

  if (!updated) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(updated, 200);
});

accountsRoute.delete('/:id', async (c) => {
  const parsedId = parseParam(c, idParamSchema, c.req.param('id'));
  if ('error' in parsedId) {
    return parsedId.error;
  }

  const user = c.get('user');
  const id = parsedId.data;

  const [deleted] = await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)))
    .returning();

  if (!deleted) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.body(null, 204);
});
