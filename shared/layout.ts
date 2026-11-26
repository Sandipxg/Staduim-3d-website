// Stadium geometry + seat inventory layout. Pure TypeScript (no three.js) so the
// browser and the Node API generate exactly the same seats, blocks and prices.

export const A = 58;   // inner boundary half-length (m)
export const B = 40;   // inner boundary half-width (m)
export const R0 = 12;  // inner boundary corner radius (m)
export const ROW_D = 0.85;
export const SEAT_W = 0.55;
export const AISLE = 1.3;
export const LAYOUT_SEED = 20261212;

export interface Tier { name: string; rows: number; d0: number; h0: number; rise: number; mult: number }
export interface Stand { name: string; gate: string; base: number; cols: number; tag: string }

export const TIERS: Tier[] = [
  { name: 'Lower Tier',  rows: 14, d0: 0.6,  h0: 1.2,  rise: 0.36, mult: 1.15 },
  { name: 'Middle Tier', rows: 12, d0: 14.6, h0: 9.6,  rise: 0.48, mult: 1.40 },
  { name: 'Upper Tier',  rows: 14, d0: 27.6, h0: 18.8, rise: 0.60, mult: 0.78 },
];

export const STANDS: Stand[] = [
  { name: 'North Stand',       gate: 'A', base: 4200, cols: 4, tag: 'Halfway line · players’ tunnel' },
  { name: 'North-East Corner', gate: 'B', base: 1700, cols: 2, tag: 'Corner flag view' },
  { name: 'East Stand',        gate: 'C', base: 2400, cols: 3, tag: 'Behind the goal · away end' },
  { name: 'South-East Corner', gate: 'D', base: 1600, cols: 2, tag: 'Corner flag view' },
  { name: 'South Stand',       gate: 'E', base: 3700, cols: 4, tag: 'Halfway line · family zone' },
  { name: 'South-West Corner', gate: 'F', base: 1600, cols: 2, tag: 'Corner flag view' },
  { name: 'West Stand',        gate: 'G', base: 2600, cols: 3, tag: 'Behind the goal · home end' },
  { name: 'North-West Corner', gate: 'H', base: 1700, cols: 2, tag: 'Corner flag view' },
];

export const EVENT = {
  venue: 'Meridian Arena',
  competition: 'Coastal Cup Final',
  home: 'Harbor City FC',
  away: 'Northbridge United',
  dateLabel: 'Sat 12 Dec, 19:30',
  longDate: 'Saturday 12 December 2026 · Kick-off 19:30 · Gates open 17:30',
};

export interface Frame { x: number; z: number; nx: number; nz: number }
export interface Seat {
  id: number; x: number; y: number; z: number; nx: number; nz: number;
  stand: number; block: number; tier: number; row: number; num: number;
  initial: 0 | 1;
}
export interface Block {
  id: number; stand: number; tier: number; col: number; label: string; price: number;
  seats: number[]; rowSeats: number[][];
  c: [number, number, number]; n: [number, number];
}
export interface Layout { seats: Seat[]; blocks: Block[]; standBlocks: number[][]; standSeats: number[][] }

export function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const round50 = (n: number) => Math.round(n / 50) * 50;
export const bookingFee = (price: number) => round50(price * 0.06) || 50;
export const tierFloor = (t: number) => (t === 0 ? 0 : TIERS[t - 1].h0 + (TIERS[t - 1].rows - 1) * TIERS[t - 1].rise);

/** Point on stand k at fraction u (clockwise seen from above), offset d metres outward from the inner boundary. */
export function frameAt(k: number, u: number, d: number): Frame {
  if (k % 2 === 0) {
    const a = (k / 2) * Math.PI / 2, nx = Math.sin(a), nz = -Math.cos(a), tx = Math.cos(a), tz = Math.sin(a);
    const half = k % 4 === 0 ? A - R0 : B - R0, inner = k % 4 === 0 ? B : A, s = -half + 2 * half * u;
    return { x: nx * (inner + d) + tx * s, z: nz * (inner + d) + tz * s, nx, nz };
  }
  const a0 = ((k - 1) / 2) * Math.PI / 2, a = a0 + u * Math.PI / 2, nx = Math.sin(a), nz = -Math.cos(a), am = a0 + Math.PI / 4;
  const cx = (Math.sin(am) > 0 ? 1 : -1) * (A - R0), cz = (-Math.cos(am) > 0 ? 1 : -1) * (B - R0);
  return { x: cx + nx * (R0 + d), z: cz + nz * (R0 + d), nx, nz };
}
export function standLen(k: number, d: number): number {
  return k % 2 === 0 ? 2 * (k % 4 === 0 ? A - R0 : B - R0) : (R0 + d) * Math.PI / 2;
}

export function generateLayout(): Layout {
  const rand = mulberry32(LAYOUT_SEED);
  const seats: Seat[] = [], blocks: Block[] = [];
  const colStart: number[] = [];
  let colIndex = 0;
  STANDS.forEach(st => { colStart.push(colIndex); colIndex += st.cols; });
  const standBlocks: number[][] = STANDS.map(() => []);

  STANDS.forEach((st, k) => {
    TIERS.forEach((tr, t) => {
      for (let j = 0; j < st.cols; j++) {
        const b: Block = {
          id: blocks.length, stand: k, tier: t, col: j,
          label: String((t + 1) * 100 + colStart[k] + j + 1),
          price: round50(st.base * tr.mult), seats: [], rowSeats: [], c: [0, 0, 0], n: [0, 0],
        };
        blocks.push(b); standBlocks[k].push(b.id);
        const occ = Math.min(0.9, 0.42 + rand() * 0.36 + (t === 1 ? 0.08 : 0) + (k % 2 === 0 ? 0.06 : 0));
        for (let r = 0; r < tr.rows; r++) {
          const d = tr.d0 + r * ROW_D + 0.42, y = tr.h0 + r * tr.rise, L = standLen(k, d), seg = L / st.cols;
          const s0 = j * seg + AISLE / 2, s1 = (j + 1) * seg - AISLE / 2;
          const n = Math.floor((s1 - s0) / SEAT_W), off = s0 + ((s1 - s0) - n * SEAT_W) / 2 + SEAT_W / 2;
          const rowIdx: number[] = [];
          let i = 0;
          while (i < n) {
            const takenRun = rand() < occ, len = takenRun ? 1 + Math.floor(rand() * 7) : 1 + Math.floor(rand() * 4);
            for (let q = 0; q < len && i < n; q++, i++) {
              const f = frameAt(k, (off + i * SEAT_W) / L, d);
              const id = seats.length;
              seats.push({ id, x: f.x, y, z: f.z, nx: f.nx, nz: f.nz, stand: k, block: b.id, tier: t, row: r + 1, num: n - i, initial: takenRun ? 1 : 0 });
              b.seats.push(id); rowIdx.push(id);
            }
          }
          b.rowSeats.push(rowIdx);
        }
        let cx = 0, cy = 0, cz = 0, nx = 0, nz = 0;
        for (const id of b.seats) { const s = seats[id]; cx += s.x; cy += s.y; cz += s.z; nx += s.nx; nz += s.nz; }
        const c = b.seats.length, nl = Math.hypot(nx, nz) || 1;
        b.c = [cx / c, cy / c, cz / c]; b.n = [nx / nl, nz / nl];
      }
    });
  });
  const standSeats = standBlocks.map(ids => ids.flatMap(id => blocks[id].seats));
  return { seats, blocks, standBlocks, standSeats };
}
