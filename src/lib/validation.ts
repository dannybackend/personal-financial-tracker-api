import type { Context } from 'hono';
import { z } from 'zod';

/**
 * Parses a request's JSON body against a Zod schema.
 *
 * Returns either the validated data or a ready-to-return Response: 400 for
 * a malformed JSON body, 422 for a well-formed body that fails validation.
 * Callers check `'error' in result` and return it directly on failure.
 */
export async function parseBody<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: c.json({ error: 'Malformed JSON body' }, 400) };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return { error: c.json({ error: 'Validation failed', details: z.treeifyError(result.error) }, 422) };
  }

  return { data: result.data };
}

/**
 * Validates a route param (e.g. `:id`) against a Zod schema before it
 * reaches a query - an invalid UUID passed straight to a `uuid` column
 * comparison fails as a raw DB error (500), not a clean 422.
 */
export function parseParam<T extends z.ZodType>(
  c: Context,
  schema: T,
  value: string,
): { data: z.infer<T> } | { error: Response } {
  const result = schema.safeParse(value);
  if (!result.success) {
    return { error: c.json({ error: 'Validation failed', details: z.treeifyError(result.error) }, 422) };
  }

  return { data: result.data };
}
