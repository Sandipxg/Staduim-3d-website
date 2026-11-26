// Seat inventory + bookings, persisted to a JSON file so bookings survive restarts.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { generateLayout, STANDS, TIERS, bookingFee } from '../shared/layout';
import type { Booking } from '../shared/api';

interface StoredBooking extends Booking { clientId: string }
interface Data { statuses: string; bookings: StoredBooking[] }

const DATA_FILE = resolve(process.env.DATA_FILE ?? 'data/inventory.json');
export const layout = generateLayout();

function initialData(): Data {
  return { statuses: layout.seats.map(s => String(s.initial)).join(''), bookings: [] };
}

function load(): Data {
  if (!existsSync(DATA_FILE)) return initialData();
  try {
    const d = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Data;
    if (typeof d.statuses === 'string' && d.statuses.length === layout.seats.length && Array.isArray(d.bookings)) return d;
  } catch { /* fall through to a fresh inventory */ }
  console.warn('[store] data file unreadable or from a different layout, starting fresh');
  return initialData();
}

const data = load();
const statuses = Uint8Array.from(data.statuses, ch => Number(ch));
let updatedAt = new Date().toISOString();

function save() {
  data.statuses = Array.from(statuses).join('');
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, DATA_FILE);
}

/** Status string for one viewer: their own bookings come back as '2'. */
export function statusesFor(clientId?: string): { statuses: string; updatedAt: string } {
  const out: string[] = Array.from(statuses, v => (v ? '1' : '0'));
  if (clientId) for (const b of data.bookings) if (b.clientId === clientId) out[b.seatId] = '2';
  return { statuses: out.join(''), updatedAt };
}

export function bookingsFor(clientId: string): Booking[] {
  return data.bookings.filter(b => b.clientId === clientId).map(({ clientId: _c, ...b }) => b);
}

export type BookResult = { ok: true; booking: Booking } | { ok: false; reason: 'not_found' | 'taken' };

/** Single-process check-and-set: Node runs this synchronously, so two requests can't book the same seat. */
export function book(seatId: number, clientId: string): BookResult {
  const seat = layout.seats[seatId];
  if (!seat) return { ok: false, reason: 'not_found' };
  if (statuses[seatId] !== 0) return { ok: false, reason: 'taken' };
  const block = layout.blocks[seat.block], stand = STANDS[seat.stand], fee = bookingFee(block.price);
  const booking: StoredBooking = {
    ref: `MRA-${randomBytes(3).toString('hex').toUpperCase()}-${block.label}`,
    seatId, clientId,
    stand: stand.name, gate: stand.gate, block: block.label, tier: TIERS[block.tier].name,
    row: seat.row, seat: seat.num, price: block.price, fee, total: block.price + fee,
    createdAt: new Date().toISOString(),
  };
  statuses[seatId] = 1;
  data.bookings.push(booking);
  updatedAt = booking.createdAt;
  save();
  const { clientId: _c, ...pub } = booking;
  return { ok: true, booking: pub };
}

export function resetInventory() {
  const fresh = initialData();
  statuses.set(Uint8Array.from(fresh.statuses, ch => Number(ch)));
  data.bookings = [];
  updatedAt = new Date().toISOString();
  save();
}
