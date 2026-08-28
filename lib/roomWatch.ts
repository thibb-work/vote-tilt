/**
 * Is anyone reading the room this phone is writing into?
 *
 * A phone's room id comes from the QR it scanned; the host's comes from its own
 * browser storage. The two drift apart more easily than they look: the host
 * clears site data, opens the app from a different Vercel URL, presses New QR,
 * or a phone still has a tab open from the round before. Every one of those
 * ends the same way -- the phone publishes happily into `rooms/<old>/phones`,
 * the host watches `rooms/<new>/phones`, and neither screen says a word. The
 * host reads zero phones, the phone reads a live socket and a working dial, and
 * the only clue is that the numbers never move.
 *
 * The signal was already there. The host rewrites `rooms/<id>/tally` every
 * TALLY_INTERVAL_MS whether or not anybody is in the room, and every phone
 * already subscribes to that node. So tally updates arriving is proof that a
 * host screen is watching this exact room, and a node that has gone quiet means
 * nobody is -- no new route, no rules change, no extra traffic.
 *
 * Two rules keep it honest, and both are the reason this is a pure function
 * rather than a condition inlined in the hook:
 *
 *  - staleness is measured by when the update *arrived on this phone*, never by
 *    the `t` inside it. That timestamp is the host's clock, and a phone whose
 *    clock is a minute fast would accuse a perfectly healthy room.
 *  - a dropped socket is a different failure with its own message, and a phone
 *    that just reconnected or just woke from a pocket has not had time to hear
 *    anything yet. Neither is evidence of an orphaned room.
 */

export type WatchState =
  /** not enough evidence yet: no socket, or the grace window has not elapsed */
  | 'checking'
  /** a tally arrived recently, so a host screen is reading this room */
  | 'watched'
  /** the socket is up and the tally has gone quiet: nobody is reading this room */
  | 'orphaned';

/**
 * How long the tally may go quiet before the phone says so.
 *
 * The host writes four times a second, so anything above a second is already
 * generous; this leaves room for a wifi stumble and a backgrounded tab whose
 * timers the browser has throttled, and still surfaces the problem while the
 * person is looking at the screen.
 */
export const ORPHAN_GRACE_MS = 5000;

export function roomWatchState({
  live,
  msSinceTally,
  msSinceSettled,
  graceMs = ORPHAN_GRACE_MS,
}: {
  /** whether the realtime socket is up right now */
  live: boolean;
  /** ms since a tally last arrived on this device, or null if none ever has */
  msSinceTally: number | null;
  /** ms since the grace clock last restarted: connect, reconnect, or wake */
  msSinceSettled: number;
  graceMs?: number;
}): WatchState {
  // No socket is its own failure and already has its own message. Blaming the
  // room here would put two different explanations on one broken connection.
  if (!live) return 'checking';

  // Positive evidence first: an update that arrived is proof, and outranks any
  // window we might still be inside.
  if (msSinceTally !== null && msSinceTally < graceMs) return 'watched';

  // Nothing heard yet, but nothing has had time to be heard.
  if (msSinceSettled < graceMs) return 'checking';

  return 'orphaned';
}
