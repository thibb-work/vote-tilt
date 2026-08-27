'use client';

import { useEffect, useState } from 'react';
import { chooseJoinOrigin, type JoinOrigin, type Reach } from './joinOrigin';
import { useClientValue } from './useClientValue';

/**
 * Inlined at build time -- see the `env` block in next.config.ts, which fills it
 * from VERCEL_PROJECT_PRODUCTION_URL when nobody set it by hand.
 */
const CANONICAL = process.env.NEXT_PUBLIC_JOIN_ORIGIN ?? '';

export function useJoinOrigin(): JoinOrigin {
  const current = useClientValue(() => window.location.origin, '');
  const [reach, setReach] = useState<Reach>('checking');

  useEffect(() => {
    if (!current) return;
    let alive = true;

    // `credentials: 'omit'` is the entire point of this request. The host's
    // browser holds whatever cookie unlocks this origin, so asking with it
    // would only confirm what we can already see on screen. Asking without it
    // is the phone's question: can someone who has never been here open this?
    //
    // `redirect: 'manual'` keeps a sign-in redirect legible as a non-2xx
    // instead of following it -- and following it would be blocked by the app's
    // own connect-src anyway.
    fetch('/', { credentials: 'omit', redirect: 'manual', cache: 'no-store' })
      .then((res) => {
        // Anything but a 2xx means a phone does not get the page. Which
        // particular wall it is -- a login redirect, a 404, a bad deploy --
        // changes the cause but not the answer.
        if (alive) setReach(res.ok ? 'public' : 'unreachable');
      })
      .catch(() => {
        if (alive) setReach('unknown');
      });

    return () => {
      alive = false;
    };
  }, [current]);

  return chooseJoinOrigin({ current, canonical: CANONICAL, reach });
}
