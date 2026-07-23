import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { auth } from './lib/auth.js';

const app = new Hono();

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
