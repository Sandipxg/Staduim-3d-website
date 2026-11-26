# Context

## Product context
- **Owner:** Sandip (demo inspired by Omnya Lab's "Choose your seat" stadium)
- **Domain terms:** *stand* (one side or corner of the bowl, has a gate), *tier* (lower / middle / upper ring), *block* (a section of one tier between aisles, numbered tier×100 + column, e.g. 214), *row* (1 = front), *vomitory* (stair tunnel into a tier).
- **Event (fictional):** Coastal Cup Final, Harbor City FC vs Northbridge United, Sat 12 Dec 2026 19:30, Meridian Arena. Prices in ₹.
- **Constraints:** No 3D model files; everything is generated in code. Must run in a normal laptop browser.

## Design system
### Colours
| Token | Value | Use |
|---|---|---|
| `--ink` | #0b1116 | Page background, loader |
| `--glass` | rgba(12,17,22,.78) | Panels over the 3D view |
| `--fg` | #f0f1ec | Text |
| `--muted` | #98a3ab | Secondary text |
| `--hi` | #ff7a1a | Hover highlight, primary buttons |
| `--yours` | #2fd3bf | Your booked seats |
| `--taken` | #c42a22 | Booked seats (legend) |
| `--free` | #e6e8ea | Open seats (legend) |
| `--paper` | #f3f1ea | Ticket and price tag |

### Typography
- Display / labels: **Barlow Condensed** 600–800 (stadium signage feel), uppercase labels with letter-spacing
- Body: **Barlow** 400–600; codes: **IBM Plex Mono**

### Layout & motion
- Full-bleed canvas; glass control rail on the left (bottom sheet under 760 px); hint pill bottom centre; price tag follows the cursor
- Camera flights 1.6–2.6 s ease-in-out cubic on a lifted Bézier path; day→night blend 1.4 s; reduced-motion turns flights into cuts

### Copy tone
Short, direct, from the buyer's side ("Pick a white seat. Red seats are booked.").

## References
- https://www.omnyalab.com/demo/choose-your-seat/
