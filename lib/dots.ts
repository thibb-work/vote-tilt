import { polar, type Point } from './geometry.ts';
import { DEAD_ZONE_DEG } from './tilt.ts';

/**
 * One dot per phone on the host dial. A phone reports where it is pointing and
 * how hard it is leaning; the dot sits at that bearing, at a radius that grows
 * with the lean. A phone lying flat has no bearing at all and parks in the hub
 * rather than vanishing -- thirty people should still add up to thirty dots.
 */
export interface PhoneReading {
  id: string;
  /** Degrees clockwise from straight up, or null when the phone is flat. */
  heading: number | null;
  /** Degrees off horizontal. */
  magnitude: number;
}

export interface Dot extends Point {
  id: string;
  /** True while the phone is inside the dead zone and not aiming at a wedge. */
  flat: boolean;
}

/** Lean at which a dot reaches the outer edge. Past this it stops travelling. */
export const FULL_LEAN_DEG = 45;

/**
 * Flat phones are scattered around the hub instead of stacked on the centre
 * point, so a room that has not started tilting still reads as a crowd. The
 * offset is derived from the id, not random, so a dot does not jitter between
 * frames.
 */
export function hubScatter(id: string, spread: number): Point {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const angle = (h % 360) * (Math.PI / 180);
  const radius = ((h >>> 9) % 100) / 100 * spread;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function dotFor(
  reading: PhoneReading,
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
): Dot {
  const flat = reading.heading === null || reading.magnitude < DEAD_ZONE_DEG;

  if (flat) {
    const s = hubScatter(reading.id, rInner * 0.55);
    return { id: reading.id, x: cx + s.x, y: cy + s.y, flat: true };
  }

  const reach = Math.min(1, Math.max(0, reading.magnitude / FULL_LEAN_DEG));
  const r = rInner + reach * (rOuter - rInner);
  const p = polar(cx, cy, r, reading.heading as number);
  return { id: reading.id, x: p.x, y: p.y, flat: false };
}

export function dotsFor(
  readings: PhoneReading[],
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
): Dot[] {
  return readings.map((r) => dotFor(r, cx, cy, rInner, rOuter));
}
