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

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function isHost(): Promise<boolean> {
  const value = (await cookies()).get(HOST_COOKIE)?.value;
  return !!value && constantTimeEqual(value, hostToken());
}
