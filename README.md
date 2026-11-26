# Meridian Arena Tickets

Pick a stadium seat in 3D. Explore a realistic, fully code-generated stadium, fly to any seat to see its real view of the pitch, and book it against a live inventory.

## Features
- Procedural stadium: physical sky and sun, soft shadows, reflections, translucent truss roof, glass facade, LED boards, park, car parks and skyline — no 3D model files
- Stand → block → seat flow with camera flights and hover price tags
- View from your seat, drag to look around
- Booked seats red, open seats white, your seats teal
- Day / night with floodlights
- Node API with double-booking protection and a confirmation ticket

## Stack
React 18 · Vite · TypeScript · three.js 0.147 · Zustand · TanStack Query · Hono (Node) · Zod

```mermaid
flowchart LR
  B[Browser: React UI + three.js engine] -->|/api| H[Hono API]
  H --> F[(inventory.json)]
```

## Quick start
```bash
pnpm install
pnpm dev     # http://localhost:5173
```
Production: `pnpm build && pnpm start` → http://localhost:8787

More in [/docs](./docs/README.md).
