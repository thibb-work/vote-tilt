/**
 * A simulated room for /demo.
 *
 * The landing URL shows nothing without a QR code, which makes the product look
 * broken to anyone who simply opens it. This fills that gap: a dial that is
 * already alive, so a visitor can see what a round looks like and drive a needle
 * through it themselves.
 *
 * The phones here are invented. That is stated on the page rather than hidden --
 * a demo that quietly passes fake dots off as a live room would be lying about
 * the one thing the product is for. Nothing in this module talks to a database;
 * it is arithmetic on a timer.
 *
 * Pure, with the randomness injected, so the drift can be tested without a
 * browser and without waiting for real seconds to pass.
 */
import { DEAD_ZONE_DEG, WEDGE_COUNT, WEDGE_DEG, angleDelta, wedgeCentre } from './tilt.ts';
import type { PhoneReading } from './dots.ts';

export interface SimPhone {
  id: string;
  /** degrees clockwise from straight up */
  heading: number;
  /** degrees off horizontal */
  magnitude: number;
  /** the wedge this phone is drifting toward */
  target: number;
  /** the lean it settles at once it gets there */
  lean: number;
  /** ms timestamp at which it picks somewhere new */
  switchAt: number;
}

/** Enough to look like a room, few enough that the dots stay legible. */
export const SIM_PHONE_COUNT = 11;

/** How long a phone sits on a wedge before reconsidering. */
const MIN_DWELL_MS = 2400;
const MAX_DWELL_MS = 7200;

/** Share of the remaining distance covered each step. Slow enough to read. */
const EASE = 0.07;

/** Some of the room is always lying flat. Abstaining has to be visible too. */
const ABSTAIN_CHANCE = 0.15;

/** Degrees of wander, so a settled phone still breathes rather than freezing. */
const JITTER_DEG = 1.6;

type Random = () => number;

const dwell = (now: number, random: Random) =>
  now + MIN_DWELL_MS + random() * (MAX_DWELL_MS - MIN_DWELL_MS);

/** A committed lean, or a flat phone that is present but aiming at nothing. */
const nextLean = (random: Random) =>
  random() < ABSTAIN_CHANCE ? random() * (DEAD_ZONE_DEG - 3) : 24 + random() * 18;

export function createSimRoom(
  count: number = SIM_PHONE_COUNT,
  now: number = Date.now(),
  random: Random = Math.random,
): SimPhone[] {
  return Array.from({ length: count }, (_, i) => {
    const target = Math.min(WEDGE_COUNT - 1, Math.floor(random() * WEDGE_COUNT));
    const lean = nextLean(random);
    return {
      id: `sim-${i}`,
      // Spread the starting positions across the wedge rather than stacking every
      // phone on its centre line, or the room opens as six tidy spokes.
      heading: (wedgeCentre(target) + (random() - 0.5) * WEDGE_DEG * 0.7 + 360) % 360,
      magnitude: lean,
      target,
      lean,
      switchAt: dwell(now, random),
    };
  });
}

export function stepSimRoom(
  phones: SimPhone[],
  now: number = Date.now(),
  random: Random = Math.random,
): SimPhone[] {
  return phones.map((phone) => {
    let { target, lean, switchAt } = phone;

    if (now >= switchAt) {
      target = Math.min(WEDGE_COUNT - 1, Math.floor(random() * WEDGE_COUNT));
      lean = nextLean(random);
      switchAt = dwell(now, random);
    }

    // Ease along the shortest way round, so a phone moving from the last wedge to
    // the first sweeps sixty degrees rather than three hundred.
    const drift = angleDelta(wedgeCentre(target), phone.heading);
    const wander = (random() - 0.5) * JITTER_DEG;
    const heading = (phone.heading + drift * EASE + wander + 360) % 360;
    const magnitude = Math.max(0, Math.min(90, phone.magnitude + (lean - phone.magnitude) * EASE));

    return { ...phone, heading, magnitude, target, lean, switchAt };
  });
}

/**
 * A flat phone reports no heading at all, exactly as a real one does, so it
 * lands in the hub and raises the total without landing in a wedge.
 */
export function toReadings(phones: SimPhone[]): PhoneReading[] {
  return phones.map((phone) => ({
    id: phone.id,
    heading: phone.magnitude < DEAD_ZONE_DEG ? null : phone.heading,
    magnitude: phone.magnitude,
  }));
}

/**
 * Where a pointer is aiming, in the same terms a gyroscope reports.
 *
 * A visitor on a laptop has no motion sensor, and the demo exists precisely for
 * people who have just opened the URL -- so dragging has to produce a reading
 * indistinguishable from a tilt. Distance from the hub stands in for how hard
 * the phone is leaning.
 */
export function pointerToReading(
  dx: number,
  dy: number,
  radius: number,
): { heading: number; magnitude: number } {
  const heading = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const reach = radius > 0 ? Math.hypot(dx, dy) / radius : 0;
  return { heading, magnitude: Math.max(0, Math.min(90, reach * 60)) };
}
