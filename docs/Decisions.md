# Decisions

## D-004 — JSON file for seat inventory (not Postgres + Orchid ORM yet)
- **Date:** 2026-11-26 · **Status:** Accepted
- **Context:** Preference is PostgreSQL + Orchid ORM. This is a demo with one event and one server process.
- **Decision:** Keep inventory and bookings in `data/inventory.json`, written atomically (temp file + rename). Node's single thread makes the check-and-set safe.
- **Alternatives:** Postgres + Orchid ORM — right for production, but adds a database to run for a demo.
- **Consequences:** Only one server instance can run. Moving to Postgres is T-008; `server/store.ts` is the only file that changes.

## D-003 — Hono for the API
- **Date:** 2026-11-26 · **Status:** Accepted
- **Context:** Small REST API that also serves the built SPA.
- **Decision:** Hono on `@hono/node-server`, run with `tsx` (no separate server build step).
- **Alternatives:** Express (older, untyped), Fastify (more setup than needed).

## D-002 — Keep a vanilla three.js engine, pinned to 0.147.0
- **Date:** 2026-11-26 · **Status:** Accepted
- **Context:** The goal was "no quality loss" when moving to React.
- **Decision:** Port the scene code as a TypeScript class driven by React, instead of rewriting it in react-three-fiber. Pin three.js to the version the look was tuned on.
- **Alternatives:** react-three-fiber (more React-like, but a rewrite risks visual drift); upgrading three (r152+ changed colour management and light units, which shifts every colour and intensity).
- **Consequences:** Upgrading three later needs a re-tune of exposure, light intensities and colours.

## D-001 — React + Vite SPA
- **Date:** 2026-11-26 · **Status:** Accepted
- **Context:** A single interactive screen, no SEO.
- **Decision:** Vite SPA rather than Next.js, per the decision guide.

## D-000 — No React StrictMode
- **Date:** 2026-11-26 · **Status:** Accepted
- **Context:** StrictMode mounts effects twice in development, creating two WebGL contexts and doubling build time.
- **Decision:** Render without StrictMode; the engine effect cleans up properly on unmount.
