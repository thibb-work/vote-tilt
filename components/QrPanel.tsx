'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { joinUrl } from '@/lib/joinOrigin';
import { useJoinOrigin } from '@/lib/useJoinOrigin';
import { ROOM_QUERY_KEY } from '@/lib/room';

/**
 * Points at the origin the host is already on -- unless a phone cannot open it,
 * in which case it points at the public one instead. See lib/joinOrigin.ts for
 * why that distinction exists at all.
 */
export function QrPanel({ roomId }: { roomId: string | null }) {
  const { origin, reason } = useJoinOrigin();

  // The room id rides in the link and nowhere else. It is the only thing
  // standing between a public database URL and a stuffed ballot, so it must not
  // be rendered as text next to the code.
  const link = origin && roomId ? joinUrl(origin, roomId, ROOM_QUERY_KEY) : '';

  // Kept with the link it was drawn from rather than on its own. Encoding is
  // asynchronous, so a bare `src` would keep displaying the previous round's
  // code -- or the previous origin's -- until the new one resolved, and a stale
  // code scans just as cleanly as a live one.
  const [code, setCode] = useState<{ link: string; src: string } | null>(null);
  const src = code?.link === link ? code.src : '';

  useEffect(() => {
    if (!link) return;
    let alive = true;

    void QRCode.toDataURL(link, {
      margin: 1,
      width: 640,
      errorCorrectionLevel: 'M',
      color: { dark: '#2a211aff', light: '#fffdf9ff' },
    }).then((data) => {
      if (alive) setCode({ link, src: data });
    });

    return () => {
      alive = false;
    };
  }, [link]);

  if (reason === 'stranded') {
    return (
      <aside className="join-card">
        <h2>Scan to join</h2>
        {/* Showing a code here would be worse than showing none: it would scan
            cleanly and land every phone on a sign-in page, and the host would
            have no way to tell from the projector. */}
        <p className="join-warn">
          Phones cannot open this address — scanning would land them on a sign-in
          page, so there is no code to show.
        </p>
        <p className="join-note">
          Open the host screen on the public address for this project, or set
          NEXT_PUBLIC_JOIN_ORIGIN to it.
        </p>
      </aside>
    );
  }

  return (
    <aside className="join-card">
      <h2>Scan to join</h2>
      {src ? (
        // A data: URI generated in the browser -- next/image has nothing to optimise here.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="qr" src={src} alt="QR code to join the vote" />
      ) : (
        <div className="qr" style={{ aspectRatio: 1 }} />
      )}
      {/* Read from the same origin the code was built from, so the text under a
          code can never disagree with the code above it. */}
      <div className="join-url">{(origin ?? '').replace(/^https?:\/\//, '')}</div>
      {reason === 'fallback' && (
        <p className="join-warn">
          This screen is on an address phones cannot open, so the code points at
          the public one above.
        </p>
      )}
      <p className="join-note">This code is unique to the round. Reopen the room to retire it.</p>
    </aside>
  );
}
