# API

Base: `http://localhost:8787` (Vite proxies `/api` in development). JSON everywhere. No auth.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/health` | – | `{ ok, seats }` |
| GET | `/api/event` | – | Event info |
| GET | `/api/seats` | `?clientId=` | `{ statuses, updatedAt }` — one char per seat id: `0` open, `1` booked, `2` booked by this clientId |
| GET | `/api/bookings` | `?clientId=` (required) | `Booking[]` for this browser |
| POST | `/api/bookings` | `{ seatId: number, clientId: string(8–64) }` | `201 Booking` · `400` bad body · `404` unknown seat · `409` already booked |
| POST | `/api/reset` | – | Resets inventory to the seeded state. `404` in production |

`Booking`: `{ ref, seatId, stand, gate, block, tier, row, seat, price, fee, total, createdAt }` (see `shared/api.ts`).

Example:
```bash
curl -X POST localhost:8787/api/bookings -H 'content-type: application/json' \
  -d '{"seatId":0,"clientId":"demo-client-1"}'
```
