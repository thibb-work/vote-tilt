'use client';

import { useEffect, useRef, useState } from 'react';
import { ActivateGate } from '@/components/ActivateGate';
import { Dial } from '@/components/Dial';
import { WinnerVeil } from '@/components/WinnerVeil';
import { FALLBACK_OPTIONS } from '@/lib/constants';
import { createTiltTracker, type TiltReading } from '@/lib/tilt';
import { talliesToCounts } from '@/lib/tally';
import { useRoom } from '@/lib/useRoom';
import { useSession } from '@/lib/useSession';

const FLAT: TiltReading = { wedge: null, magnitude: 0, heading: null };

export default function VotePage() {
  const session = useSession();
  const room = useRoom({ role: 'voter' });

  const [active, setActive] = useState(false);
  const [reading, setReading] = useState<TiltReading>(FLAT);

  const tracker = useRef(createTiltTracker());
  const latest = useRef<TiltReading>(FLAT);

  useEffect(() => {
    if (!active) return;

    const onOrientation = (event: DeviceOrientationEvent) => {
      latest.current = tracker.current.update({ beta: event.beta, gamma: event.gamma });
    };
    window.addEventListener('deviceorientation', onOrientation, true);

    // Sensors fire faster than the screen repaints, and re-rendering on every
    // sample makes the dial stutter. Sample once per frame, and only commit
    // state when something moved enough to be visible.
    let frame = 0;
    const tick = () => {
      setReading((prev) => {
        const next = latest.current;
        const sameHeading =
          prev.heading === null && next.heading === null
            ? true
            : prev.heading !== null &&
              next.heading !== null &&
              Math.abs(prev.heading - next.heading) < 0.8;

        if (prev.wedge === next.wedge && sameHeading && Math.abs(prev.magnitude - next.magnitude) < 0.5) {
          return prev;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
      cancelAnimationFrame(frame);
    };
  }, [active]);

  const { publish } = room;
  const frozen = session?.frozen ?? false;

  // Keep streaming while the round is open, whatever the phone is doing. A
  // phone never commits to anything -- it is a live pointer until the host
  // freezes, and freezing is what turns the last position into a vote.
  useEffect(() => {
    if (!active || frozen) return;
    publish(reading.heading, reading.magnitude);
  }, [active, frozen, reading.heading, reading.magnitude, publish]);

  if (!active) {
    return (
      <main className="stage">
        <ActivateGate onReady={() => setActive(true)} />
      </main>
    );
  }

  const options = session?.options ?? FALLBACK_OPTIONS;
  const frozenCounts = talliesToCounts(session?.frozen_tallies);
  const aiming = reading.wedge !== null ? options[reading.wedge] : null;

  return (
    <main className="stage">
      <div className="dial-wrap">
        <Dial
          options={options}
          counts={frozen ? frozenCounts : room.counts}
          active={reading.wedge}
          heading={reading.heading}
          magnitude={reading.magnitude}
          total={room.total}
          showCounts
        />
      </div>

      <div className="status-line">
        <span className={`dot${room.status === 'live' ? '' : ' is-off'}`} />
        {room.status !== 'live'
          ? 'Reconnecting'
          : frozen
            ? 'Round closed'
            : aiming
              ? `Aiming at ${aiming}`
              : 'Level — aiming at nothing'}
      </div>

      {!frozen && (
        <p className="status-hint">Tilt freely. The host closes the round from the main screen.</p>
      )}

      {frozen && <WinnerVeil options={options} counts={frozenCounts} />}
    </main>
  );
}
