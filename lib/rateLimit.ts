/**
 * Fixed-window limiter for the host passcode.
 *
 * No 'server-only' guard here on purpose: the module holds no secrets, and the
 * guard makes the counting logic impossible to unit test outside Next.
 *
 * Deliberately in-memory: the passcode is the one credential a person can guess,
 * and unlimited guesses is the difference between "needs the passcode" and
 * "needs an afternoon". A serverless instance holds its own counter, so a
 * determined attacker spread across cold starts gets more attempts than the
 * limit suggests -- this raises the cost of a script pointed at the endpoint,
 * it is not a guarantee. Anything stronger needs a shared store.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;
/** Bound the map so a spray of forged addresses cannot grow it without limit. */
const MAX_TRACKED = 2_000;

const hits = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets, for Retry-After. */
  retryAfter: number;
}

export function rateLimit(key: string, now = Date.now()): RateLimitResult {
  const existing = hits.get(key);

  if (!existing || existing.resetAt <= now) {
    if (hits.size >= MAX_TRACKED) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      if (hits.size >= MAX_TRACKED) hits.clear();
    }
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count++;
  if (existing.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Client address as seen through Vercel's proxy. Falls back to a shared bucket. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
}

/** Test seam. */
export function resetRateLimit(): void {
  hits.clear();
}
