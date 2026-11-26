// Request/response shapes shared by the API and the React client.
import { z } from 'zod';

/** Seat status codes as sent over the wire: 0 open, 1 booked by someone else, 2 booked by you. */
export type SeatStatus = 0 | 1 | 2;

export interface SeatsResponse {
  /** One character per seat id, '0' | '1' | '2'. */
  statuses: string;
  updatedAt: string;
}

export const createBookingSchema = z.object({
  seatId: z.number().int().nonnegative(),
  clientId: z.string().min(8).max(64),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export interface Booking {
  ref: string;
  seatId: number;
  stand: string;
  gate: string;
  block: string;
  tier: string;
  row: number;
  seat: number;
  price: number;
  fee: number;
  total: number;
  createdAt: string;
}
