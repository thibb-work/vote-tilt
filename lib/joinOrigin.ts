/**
 * Which origin the QR code should encode.
 *
 * The host screen and a scanning phone do not see the same web. Every Vercel URL
 * for this project except the production alias sits behind Vercel Authentication,
 * and the host's browser carries the cookie that opens it. So an origin that
 * loads perfectly on the projector is a sign-in page on every phone in the room,
 * and nothing on the host screen says so -- the QR looks right, scans fine, and
 * lands the whole room on a login wall.
 *
 * The rule is deliberately not "always encode the canonical URL". That would
 * send a preview deployment's scanners to production and make a voter-page
 * change impossible to test by scanning, which is the one thing previews are
 * for. It is: encode the origin the host is on, unless a stranger cannot open
 * it.
 *
 * Pure on purpose. The probe that answers `reach` belongs in the hook; the
 * decision it feeds is arithmetic, and arithmetic can be tested without a
 * browser -- see test/joinOrigin.test.ts.
 */

/** What a request carrying no session cookie got back from the current origin. */
export type Reach =
  /** the probe has not answered yet */
  | 'checking'
  /** a stranger gets the page */
  | 'public'
  /** a stranger gets something else: a sign-in redirect, a 404, a 500 */
  | 'unreachable'
  /** the probe itself failed, so nothing was learned */
  | 'unknown';

export type JoinReason =
  /** nothing safe to encode yet */
  | 'checking'
  /** the host's own origin, which is the normal answer */
  | 'current'
  /** the host's origin is walled, so the code points at the configured one */
  | 'fallback'
  /** the host's origin is walled and no fallback was configured */
  | 'stranded';

export interface JoinOrigin {
  /** The origin to encode, or null when there is nothing safe to encode. */
  origin: string | null;
  reason: JoinReason;
}

/** Trailing slashes make two spellings of one origin, and the QR would differ. */
function tidy(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

export function chooseJoinOrigin({
  current,
  canonical,
  reach,
}: {
  current: string | null | undefined;
  canonical: string | null | undefined;
  reach: Reach;
}): JoinOrigin {
  const here = tidy(current);
  const fallback = tidy(canonical);

  // Server render, or before the browser has told us where it is.
  if (!here) return { origin: null, reason: 'checking' };

  // Never encode a guess. A dead QR shown for one second is the exact failure
  // this file exists to prevent, and the host cannot tell it apart from a live
  // one by looking.
  if (reach === 'checking') return { origin: null, reason: 'checking' };

  // Fail open. A probe that could not run is not evidence of a problem, and
  // treating it as one would break every setup that works today.
  if (reach === 'public' || reach === 'unknown') {
    return { origin: here, reason: 'current' };
  }

  if (fallback && fallback !== here) return { origin: fallback, reason: 'fallback' };

  return { origin: null, reason: 'stranded' };
}

/** The link a phone opens. The room id rides here and nowhere else. */
export function joinUrl(origin: string, roomId: string, queryKey: string): string {
  return `${origin}/?${queryKey}=${encodeURIComponent(roomId)}`;
}
