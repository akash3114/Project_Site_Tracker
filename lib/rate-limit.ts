/**
 * Minimal in-memory login rate limiter (T-040).
 * 5 attempts / 60s per key (IP + email). For pilot single-instance use.
 * Returns { ok:true } or { ok:false, retryAfterMs }.
 */
const hits = new Map<string, number[]>();

export function rateLimit(
  key: string,
  limit = 5,
  windowMs = 60_000,
  now = Date.now(),
): { ok: boolean; retryAfterMs: number } {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    const retryAfterMs = windowMs - (now - arr[0]);
    hits.set(key, arr);
    return { ok: false, retryAfterMs };
  }
  arr.push(now);
  hits.set(key, arr);
  return { ok: true, retryAfterMs: 0 };
}

/** Test-only hook to reset state. */
export function _resetRateLimit(): void {
  hits.clear();
}
