'use client';

import { useEffect, useRef, useState } from 'react';

/** Numbers that roll rather than snap. Purely for the theatre of it. */
export function CountUp({ value, ms = 420 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;

    if (delta === 0) return;

    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(origin + delta * eased);
      setShown(next);
      from.current = next;
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    });

    return () => cancelAnimationFrame(frame);
  }, [value, ms]);

  return <>{shown}</>;
}
