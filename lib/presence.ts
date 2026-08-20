import { WEDGE_COUNT } from './tilt.ts';

/** What a phone publishes about itself. `null` means it is lying flat, abstaining. */
export interface PresenceEntry {
  wedge?: number | null;
}

/** Supabase hands back one array of entries per presence key. */
export type PresenceMap = Record<string, PresenceEntry[]>;

export interface Tally {
  counts: number[];
  /** phones present, including abstainers */
  total: number;
}

/**
 * Fold a presence map into six counts. Host screens never call track(), so they
 * never appear here and cannot inflate their own tally.
 *
 * One entry per key: a phone that re-tilts replaces its entry rather than adding
 * one, so the total tracks phones in the room, not tilts made.
 */
export function aggregatePresence(state: PresenceMap): Tally {
  const counts = new Array<number>(WEDGE_COUNT).fill(0);
  let total = 0;

  for (const entries of Object.values(state)) {
    const entry = entries?.[0];
    if (!entry) continue;
    total++;
    const w = entry.wedge;
    if (typeof w === 'number' && Number.isInteger(w) && w >= 0 && w < WEDGE_COUNT) {
      counts[w]++;
    }
  }

  return { counts, total };
}
