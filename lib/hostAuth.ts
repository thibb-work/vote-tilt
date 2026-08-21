import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const HOST_COOKIE = 'vt_host';

/**
 * Bearer value for the host cookie. Derived rather than random so it survives
 * redeploys and needs no store -- there is exactly one host and one round.
 */
export function hostToken(): string {
  const passcode = process.env.HOST_PASSCODE;
  const secret = process.env.HOST_DB_SECRET;
  if (!passcode || !secret) {
    throw new Error('HOST_PASSCODE and HOST_DB_SECRET must both be set.');
  }
  return createHash('sha256').update(`${passcode}:${secret}`).digest('hex');
}

/**
 * Compares digests rather than the strings themselves. Comparing raw values
 * means bailing out on a length mismatch, and that bail-out is measurable: it
 * tells an attacker how long the passcode is before they guess a character of
 * it. Hashing first makes every comparison the same width.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest();
  const bh = createHash('sha256').update(b).digest();
  return timingSafeEqual(ah, bh);
}

/**
 * Rejects state-changing requests issued from another site. SameSite=Lax on the
 * cookie already blocks cross-site POSTs in current browsers; this is the second
 * lock, and it costs one header read.
 *
 * A missing Origin is allowed through: browsers always send it on a fetch POST,
 * so absence means a non-browser client, which cannot be a CSRF victim.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function isHost(): Promise<boolean> {
  const value = (await cookies()).get(HOST_COOKIE)?.value;
  return !!value && constantTimeEqual(value, hostToken());
}
