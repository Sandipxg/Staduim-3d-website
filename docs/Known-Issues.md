# Known Issues

| ID | Issue | Impact | Workaround | Plan |
|---|---|---|---|---|
| K-1 | Inventory is a JSON file | One server instance only; lost on hosts without a persistent disk | Use a persistent volume | T-008 Postgres + Orchid ORM |
| K-2 | Other people's bookings appear after up to 15 s | A seat can look free briefly | Booking returns 409 and the UI recovers | T-009 Socket.IO |
| K-3 | "Your seats" are tied to one browser (localStorage id) | Clearing storage or switching device hides them | – | T-011 accounts |
| K-4 | Heavy scene (~1.3M triangles, 4K shadows) | Slow on low-end phones | Phones get fewer trees/buildings and lower resolution | Consider LOD for distant scenery |
| K-5 | three.js pinned to 0.147 | Misses newer three features | – | Re-tune lighting if upgrading (D-002) |
