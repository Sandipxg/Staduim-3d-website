# Aim

## Problem
Seat maps on ticket sites are flat diagrams. Buyers can't tell what they'll actually see from a seat.

## Goal
A stadium booking flow where the buyer explores a realistic 3D stadium, sees the real view from any seat before paying, and books it against a live inventory.

## Target users
- **Ticket buyers** — find a seat in their budget and trust the view.
- **Venue / ticketing clients** — a demo of an interactive 3D seat picker for their own venue.

## Scope
### In scope (v1)
- [x] Realistic procedural stadium (no 3D model files): physical sky, shadows, reflections, roof, facade, surroundings
- [x] Stand → block → seat flow with camera flights and hover price tags
- [x] View from seat with drag-to-look-around
- [x] Booked seats red, open seats white, your seats teal
- [x] Day / night lighting
- [x] Node API: live seat inventory, booking with double-booking protection, persisted to a file
- [x] Ticket confirmation with booking reference

### Out of scope (for now)
- Payments (Razorpay) — needs client keys
- Accounts / login — anonymous browser id is enough for a demo
- Multiple events / venues
- Real-time push of other people's bookings (polling every 15 s instead)

## Definition of Done
- [x] Same visual quality as the single-file HTML version
- [x] `pnpm dev` runs web + API; `pnpm build && pnpm start` serves production build
- [x] Booking a seat updates inventory; booking a taken seat returns 409 and the UI recovers
- [ ] Deployed with a live link
- [x] Docs up to date
