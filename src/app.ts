import { Hono } from 'hono';
import { auth } from './lib/auth.js';

/**
 * The Hono application instance, without the HTTP server attached.
 * Exported separately from `index.ts` so integration tests can call
 * `app.request()` directly, without opening a real network port.
 */
export const app = new Hono();

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));
