'use client';

import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { roomAuth, roomDb } from './firebase/client';
import { SESSION_SLUG } from './constants';
import { toSessionRow } from './session';
import type { SessionRow } from './types';

/**
 * The labels and the frozen flag, live. A freeze on the host screen lands on
 * every phone through an RTDB listener without anyone refreshing.
 *
 * This used to watch postgres_changes on the sessions table. The node it reads
 * now is server-written: the rules give every signed-in client read and refuse
 * them all write, so a phone sees the round exactly as before but still cannot
 * freeze or relabel it.
 */

export function useSession(): SessionRow | null {
  const [session, setSession] = useState<SessionRow | null>(null);

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | undefined;

    // The rules require an identity even to read, so wait for the anonymous
    // sign-in that every other client path already depends on.
    void roomAuth()
      .then(() => {
        if (!alive) return;
        stop = onValue(ref(roomDb(), `sessions/${SESSION_SLUG}`), (snap) => {
          if (alive) setSession(toSessionRow(snap.val()));
        });
      })
      .catch(() => {
        // Staying null is the honest answer: the caller already renders a
        // fallback round rather than an error, and a failed sign-in means
        // there is nothing trustworthy to show.
      });

    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  return session;
}
