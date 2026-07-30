import type { Context } from 'hono';
import type { z } from 'zod';

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
    return { error: c.json({ error: 'Validation failed', details: result.error.flatten() }, 422) };
  }

  return { data: result.data };
}
