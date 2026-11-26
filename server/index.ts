// Meridian Arena booking API (Hono on Node). In production it also serves the built React app from /dist.
import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import { logger } from 'hono/logger';
import { createBookingSchema } from '../shared/api';
import { EVENT } from '../shared/layout';
import { book, bookingsFor, layout, resetInventory, statusesFor } from './store';

const app = new Hono();
app.use('/api/*', logger());
app.use('/api/*', compress());

app.get('/api/health', c => c.json({ ok: true, seats: layout.seats.length }));
app.get('/api/event', c => c.json(EVENT));

app.get('/api/seats', c => {
  c.header('Cache-Control', 'no-store');
  return c.json(statusesFor(c.req.query('clientId')));
});

app.get('/api/bookings', c => {
  const clientId = c.req.query('clientId');
  if (!clientId) return c.json({ error: 'clientId is required' }, 400);
  return c.json(bookingsFor(clientId));
});

app.post('/api/bookings', async c => {
  const parsed = createBookingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Send seatId (number) and clientId (string).' }, 400);
  const result = book(parsed.data.seatId, parsed.data.clientId);
  if (!result.ok) {
    return result.reason === 'taken'
      ? c.json({ error: 'Someone just booked this seat. Pick another one.' }, 409)
      : c.json({ error: 'That seat does not exist.' }, 404);
  }
  return c.json(result.booking, 201);
});

// Dev helper: put every seat back to its starting state. Disabled in production.
app.post('/api/reset', c => {
  if (process.env.NODE_ENV === 'production') return c.json({ error: 'Not available' }, 404);
  resetInventory();
  return c.json({ ok: true });
});

if (existsSync('dist/index.html')) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, info => {
  console.log(`Meridian Arena API on http://localhost:${info.port} · ${layout.seats.length} seats`);
});
