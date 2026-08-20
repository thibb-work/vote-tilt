import { WEDGE_COUNT } from './tilt';

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
