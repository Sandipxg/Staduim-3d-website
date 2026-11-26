// Anonymous per-browser id so the API can tell which booked seats are yours (no login in this prototype).
const KEY = 'meridian.clientId';
let cached: string | null = null;

export function getClientId(): string {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return (cached = existing);
  } catch { /* storage blocked: fall back to a per-tab id */ }
  const id = crypto.randomUUID();
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  return (cached = id);
}
