import 'server-only';
import { sessionRef } from './admin';
import { SESSION_SLUG } from '../constants';

/**
 * The three host mutations, ported from the Postgres RPCs they replace.
 *
 * Each one is a partial update rather than a whole-node write, so a field
 * nobody is changing cannot be clobbered by a stale read. RTDB deletes a key
 * written as null, which is what the nullable columns did in Postgres too --
 * `frozen_at` absent and `frozen_at` null mean the same thing to a reader.
 */

/** ISO strings rather than ServerValue.TIMESTAMP, so the shape matches SessionRow. */
function now(): string {
  return new Date().toISOString();
}

export async function freeze(tallies: Record<string, number>): Promise<void> {
  await sessionRef(SESSION_SLUG).update({
    frozen: true,
    frozen_tallies: tallies,
    frozen_at: now(),
    updated_at: now(),
  });
}

export async function reset(): Promise<void> {
  await sessionRef(SESSION_SLUG).update({
    frozen: false,
    frozen_tallies: null,
    frozen_at: null,
    round_started: now(),
    updated_at: now(),
  });
}

export async function setOptions(options: string[]): Promise<void> {
  // The RPC refused anything but six labels. Keep that refusal here: the route
  // validates too, but this is the last place before the write.
  if (options.length !== 6) {
    throw new Error('exactly six options required');
  }
  await sessionRef(SESSION_SLUG).update({
    options,
    updated_at: now(),
  });
}
