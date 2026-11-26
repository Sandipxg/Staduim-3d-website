// UI state (Zustand). Seat data from the API lives in TanStack Query; this store mirrors the decoded
// statuses so panels can count open seats without re-decoding on every render.
import { create } from 'zustand';
import type { Booking } from '../../shared/api';
import type { Mode, StadiumEngine, TipInfo } from '../engine/StadiumEngine';
import { layout } from '../lib/layout';

interface StadiumState {
  engine: StadiumEngine | null;
  ready: boolean;
  progress: { label: string; fraction: number };
  mode: Mode; stand: number; block: number; seat: number;
  busy: boolean;
  night: boolean;
  tip: TipInfo | null;
  flash: string | null;
  booking: Booking | null;
  statuses: Uint8Array;
  setStatuses: (s: Uint8Array) => void;
  flashHint: (msg: string) => void;
  setNight: (night: boolean) => void;
}

let flashTimer = 0;

export const useStadium = create<StadiumState>((set, get) => ({
  engine: null,
  ready: false,
  progress: { label: 'Pouring the concrete', fraction: 0 },
  mode: 0, stand: -1, block: -1, seat: -1,
  busy: false,
  night: false,
  tip: null,
  flash: null,
  booking: null,
  statuses: Uint8Array.from(layout.seats, s => s.initial),
  setStatuses: statuses => { set({ statuses }); get().engine?.setStatuses(statuses); },
  flashHint: msg => {
    clearTimeout(flashTimer);
    set({ flash: msg });
    flashTimer = window.setTimeout(() => set({ flash: null }), 2600);
  },
  setNight: night => { set({ night }); get().engine?.setNight(night); },
}));

/* derived helpers */
export const freeIn = (statuses: Uint8Array, ids: number[]) => { let n = 0; for (const i of ids) if (statuses[i] === 0) n++; return n; };
export const standFrom = (k: number) => Math.min(...layout.standBlocks[k].map(b => layout.blocks[b].price));
