'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useClientValue } from '@/lib/useClientValue';

/** Points at whatever origin the host is already on, so it works on preview URLs too. */
export function QrPanel() {
  const [src, setSrc] = useState('');
  const origin = useClientValue(() => window.location.origin, '');
  const url = origin.replace(/^https?:\/\//, '');

  useEffect(() => {
    if (!origin) return;
    const join = `${origin}/`;
    void QRCode.toDataURL(join, {
      margin: 1,
      width: 640,
      errorCorrectionLevel: 'M',
      color: { dark: '#2a211aff', light: '#fffdf9ff' },
    }).then(setSrc);
  }, [origin]);

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
    </aside>
  );
}
