'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useClientValue } from '@/lib/useClientValue';
import { ROOM_QUERY_KEY } from '@/lib/room';

/** Points at whatever origin the host is already on, so it works on preview URLs too. */
export function QrPanel({ roomId }: { roomId: string | null }) {
  const [src, setSrc] = useState('');
  const origin = useClientValue(() => window.location.origin, '');
  const url = origin.replace(/^https?:\/\//, '');

  useEffect(() => {
    if (!origin || !roomId) return;
    // The room id rides in the link and nowhere else. It is the only thing
    // standing between a public database URL and a stuffed ballot, so it must
    // not be rendered as text next to the code.
    const join = `${origin}/?${ROOM_QUERY_KEY}=${roomId}`;
    void QRCode.toDataURL(join, {
      margin: 1,
      width: 640,
      errorCorrectionLevel: 'M',
      color: { dark: '#2a211aff', light: '#fffdf9ff' },
    }).then(setSrc);
  }, [origin, roomId]);

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
      <div className="join-url">{url}</div>
      <p className="join-note">This code is unique to the round. Reopen the room to retire it.</p>
    </aside>
  );
}
