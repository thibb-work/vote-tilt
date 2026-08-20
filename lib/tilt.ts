/**
 * Device orientation -> one of six wedges.
 *
 * Pure logic, no React and no browser APIs, so the boundary behaviour can be
 * tested without a phone. See RATIONALE below each constant for why it exists.
 */

export const WEDGE_COUNT = 6;
export const WEDGE_DEG = 360 / WEDGE_COUNT; // 60

/** Below this much tilt the phone is "flat" and the voter is abstaining. */
export const DEAD_ZONE_DEG = 15;
/** Once committed, you must fall this far back under the dead zone to abstain. */
export const DEAD_ZONE_RELEASE_DEG = 10;
/** Degrees past a wedge boundary before the vote switches. Kills border flicker. */
export const HYSTERESIS_DEG = 8;
/** Exponential smoothing weight on new samples. Raw sensor data jitters ~3 deg at rest. */
export const SMOOTHING = 0.2;

export interface Orientation {
  /** front-back tilt, -180..180 */
  beta: number | null;
  /** left-right tilt, -90..90 */
  gamma: number | null;
}

export interface TiltReading {
  /** 0..5, or null when the phone is flat (abstaining) */
  wedge: number | null;
  /** how far the phone is tilted, degrees, clamped to 90 */
  magnitude: number;
  /** direction of tilt in degrees clockwise from "away from you", or null when flat */
  heading: number | null;
}

/** Shortest signed difference a-b, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Wedge whose centre is nearest this heading, ignoring hysteresis. */
export function headingToWedge(heading: number): number {
  const shifted = (((heading + WEDGE_DEG / 2) % 360) + 360) % 360;
  return Math.floor(shifted / WEDGE_DEG) % WEDGE_COUNT;
}

/** Centre heading of a wedge, in degrees. Wedge 0 points straight away from you. */
export function wedgeCentre(wedge: number): number {
  return wedge * WEDGE_DEG;
}

export interface TiltTracker {
  update(o: Orientation): TiltReading;
  reset(): void;
}

/**
 * Stateful because both the smoothing filter and the hysteresis need to know
 * where the phone was a moment ago. One tracker per phone.
 */
export function createTiltTracker(): TiltTracker {
  let sBeta: number | null = null;
  let sGamma: number | null = null;
  let wedge: number | null = null;

  return {
    reset() {
      sBeta = sGamma = null;
      wedge = null;
    },

    update({ beta, gamma }: Orientation): TiltReading {
      if (beta == null || gamma == null) {
        return { wedge, magnitude: 0, heading: null };
      }

      // Low-pass filter. First sample seeds the filter rather than easing into it
      // from zero, otherwise the dial visibly slides in from the centre on load.
      sBeta = sBeta === null ? beta : sBeta + (beta - sBeta) * SMOOTHING;
      sGamma = sGamma === null ? gamma : sGamma + (gamma - sGamma) * SMOOTHING;

      const magnitude = Math.min(90, Math.hypot(sGamma, sBeta));

      // Asymmetric threshold: harder to start voting than to keep voting, so a
      // hand wobbling around 15 degrees does not drop in and out of the count.
      const threshold = wedge === null ? DEAD_ZONE_DEG : DEAD_ZONE_RELEASE_DEG;
      if (magnitude < threshold) {
        wedge = null;
        return { wedge: null, magnitude, heading: null };
      }

      // Screen-up phone: tilting the top edge away from you is beta < 0, so -beta
      // is "north". atan2(east, north) then reads clockwise from north.
      const heading = ((Math.atan2(sGamma, -sBeta) * 180) / Math.PI + 360) % 360;

      if (wedge === null) {
        wedge = headingToWedge(heading);
      } else {
        const drift = Math.abs(angleDelta(heading, wedgeCentre(wedge)));
        if (drift > WEDGE_DEG / 2 + HYSTERESIS_DEG) {
          wedge = headingToWedge(heading);
        }
      }

      return { wedge, magnitude, heading };
    },
  };
}
