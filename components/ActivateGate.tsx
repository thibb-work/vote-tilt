'use client';

import { useState } from 'react';
import { useClientValue } from '@/lib/useClientValue';

type PermissionCapableEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

/**
 * iOS Safari will not deliver orientation events until requestPermission() is
 * called from inside a user gesture, and it requires HTTPS. So the first thing
 * a voter sees is a button -- that is a platform rule, not a design choice.
 */
export function ActivateGate({ onReady }: { onReady: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const insecure = useClientValue(() => !window.isSecureContext, false);

  async function activate() {
    setBusy(true);
    setError('');

    const Orientation = window.DeviceOrientationEvent as PermissionCapableEvent | undefined;

    try {
      if (typeof Orientation?.requestPermission === 'function') {
        const result = await Orientation.requestPermission();
        if (result !== 'granted') {
          setError('Motion access was blocked. Reload the page and tap Allow.');
          setBusy(false);
          return;
        }
      }

      // Permission granted is not the same as sensor present -- a laptop grants
      // nothing and fires nothing. Wait for one real sample before continuing.
      const live = await new Promise<boolean>((resolve) => {
        const handler = (event: DeviceOrientationEvent) => {
          if (event.beta !== null || event.gamma !== null) {
            cleanup();
            resolve(true);
          }
        };
        const timer = setTimeout(() => {
          cleanup();
          resolve(false);
        }, 1500);
        const cleanup = () => {
          clearTimeout(timer);
          window.removeEventListener('deviceorientation', handler, true);
        };
        window.addEventListener('deviceorientation', handler, true);
      });

      if (!live) {
        setError('No motion sensor detected. Open this page on a phone.');
        setBusy(false);
        return;
      }

      onReady();
    } catch {
      setError('Could not start the gyroscope on this device.');
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <h1>Tilt to vote</h1>
      <p>
        Turn on your gyroscope, then tilt your phone toward whichever option you want to see
        demoed. Lie it flat to abstain.
      </p>
      <button className="big-button" onClick={activate} disabled={busy}>
        {busy ? 'Starting…' : 'Activate gyroscope'}
      </button>
      <p className="warn">
        {error ||
          (insecure ? 'This page needs HTTPS before the gyroscope will turn on.' : '')}
      </p>
    </div>
  );
}
