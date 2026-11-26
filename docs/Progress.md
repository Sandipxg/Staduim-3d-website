# Progress

## 2026-11-26
- Built a procedural 3D stadium as a single HTML page, then a realism pass (physical sky, reflections, translucent truss roof, facade, park, city).
- Simplified seat colours to booked red / open white; removed spectators and players (T-004).
- Ported to React + Vite + TypeScript with a Hono API and JSON-file inventory; visuals unchanged (T-005).
- Verified: typecheck, production build, API booking and 409 path, headless run through stand → block → seat → ticket.
- Next: deploy (T-006), payments (T-007).
