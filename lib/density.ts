/**
 * How dark a wedge gets is the whole read of the room now that nothing moves.
 * Intensity is relative to the leading wedge rather than to the number of
 * phones present: on a projector a clear leader matters more than an honest
 * share, and an evenly split room should look evenly split, not uniformly pale.
 */

/** Every wedge keeps a faint tint, so an empty dial still reads as six tiles. */
export const MIN_FILL = 0.05;
/** The leader's fill. Past this the label stops being legible at any colour. */
export const MAX_FILL = 0.92;
/** Above this fill the tile is too dark to carry ink-coloured text. */
export const FLIP_TEXT_ABOVE = 0.55;

/** Fill opacity for a wedge holding `count` votes when the leader holds `max`. */
export function fillFor(count: number, max: number): number {
  if (!Number.isFinite(count) || count <= 0) return MIN_FILL;
  const peak = Math.max(1, Number.isFinite(max) ? max : 1);
  const share = Math.min(1, count / peak);
  return MIN_FILL + (MAX_FILL - MIN_FILL) * share;
}

/** Labels flip to off-white once the tile behind them goes dark. */
export function needsLightText(fill: number): boolean {
  return fill > FLIP_TEXT_ABOVE;
}
