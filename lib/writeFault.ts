/**
 * Why the database refused a write, in words that name the next thing to try.
 *
 * A rejected `set()` used to go straight on the floor. The screen knew it was
 * not reaching the room -- that much it could infer from the silence -- but not
 * why, and the causes need different fixes: a browser blocking the sign-in, and
 * a socket that cannot reach the database at all. Telling them apart from the
 * projector is the difference between one look and another round of guessing.
 *
 * The third cause used to be the clock. The rules reject a timestamp more than
 * five seconds ahead of server time, so a device running fast had every write
 * refused. Writes now carry server time instead of local time, so that cause is
 * gone rather than merely reported -- see the skew ref in useRoom.
 */
export function writeFault(error: unknown): string {
  const text = String((error as { message?: string })?.message ?? error);

  // With a self-healing room id and a server-stamped timestamp, the rules have
  // only one thing left to refuse: a screen with no valid identity.
  if (/permission[ _]denied/i.test(text)) {
    return 'The database refused this screen — check for a blocker on this site';
  }
  return 'Cannot reach the database';
}
