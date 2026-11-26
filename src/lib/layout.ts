import { generateLayout } from '../../shared/layout';

/** Generated once on load; identical to the server's copy. */
export const layout = generateLayout();
export const SEAT_COUNT = layout.seats.length;
