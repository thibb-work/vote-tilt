import { WEDGE_COUNT, headingToWedge } from './tilt.ts';
import type { PhoneReading } from './dots.ts';

/** jsonb comes back keyed by stringified wedge index. */
export function talliesToCounts(tallies: Record<string, number> | null | undefined): number[] {
  const counts = new Array<number>(WEDGE_COUNT).fill(0);
  if (!tallies) return counts;
  for (let w = 0; w < WEDGE_COUNT; w++) counts[w] = Number(tallies[String(w)] ?? 0);
  return counts;
}

export function countsToTallies(counts: number[]): Record<string, number> {
  return Object.fromEntries(counts.map((c, w) => [String(w), c]));
}

/** Indices sharing the top count. Empty when nobody voted. */
export function leaders(counts: number[]): number[] {
  const max = Math.max(...counts);
  if (max <= 0) return [];
  return counts.flatMap((c, w) => (c === max ? [w] : []));
}

/**
 * Fold live phone positions into six counts. A phone lying flat is present but
 * aiming at nothing, so it raises the room total without landing in a wedge --
 * abstaining has to be distinguishable from having left.
 */
export function countsFrom(readings: PhoneReading[]): number[] {
  const counts = new Array<number>(WEDGE_COUNT).fill(0);
  for (const r of readings) {
    if (r.heading === null) continue;
    const w = headingToWedge(r.heading);
    if (w >= 0 && w < WEDGE_COUNT) counts[w]++;
  }
  return counts;
}
