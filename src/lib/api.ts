import type { Booking, SeatsResponse } from '../../shared/api';
import { getClientId } from './clientId';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export const api = {
  seats: () => request<SeatsResponse>(`/api/seats?clientId=${encodeURIComponent(getClientId())}`),
  myBookings: () => request<Booking[]>(`/api/bookings?clientId=${encodeURIComponent(getClientId())}`),
  book: (seatId: number) => request<Booking>('/api/bookings', { method: 'POST', body: JSON.stringify({ seatId, clientId: getClientId() }) }),
};

export function decodeStatuses(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) - 48;
  return out;
}
