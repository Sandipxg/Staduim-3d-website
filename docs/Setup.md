# Setup

## Requirements
- Node 20+ (tested on 22), pnpm 9+

## Run locally
```bash
pnpm install
pnpm dev          # API on :8787 + web on :5173 (opens the stadium at http://localhost:5173)
```

## Production
```bash
pnpm build        # typecheck + build the SPA into dist/
pnpm start        # API serves dist/ and /api on http://localhost:8787
```

## Environment variables
| Name | Purpose | Default |
|---|---|---|
| `PORT` | API port | 8787 |
| `DATA_FILE` | Inventory + bookings file | `data/inventory.json` |
| `NODE_ENV` | `production` disables `/api/reset` | – |

## Scripts
| Command | What it does |
|---|---|
| `pnpm dev` | API (watch) + Vite together |
| `pnpm dev:web` / `pnpm dev:api` | One side only |
| `pnpm build` | `tsc` + `vite build` |
| `pnpm start` | Run the API, serving `dist/` |
| `pnpm typecheck` | Type check only |

## Reset seats
```bash
curl -X POST localhost:8787/api/reset   # or delete data/inventory.json and restart
```

## Deploy
Any host that runs a long-lived Node process (Railway, Render, Fly.io): build command `pnpm install && pnpm build`, start command `pnpm start`, attach a persistent disk for `data/` (or move to Postgres, T-008).
