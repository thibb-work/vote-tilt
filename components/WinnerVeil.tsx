'use client';

import { WEDGE_COLORS } from '@/lib/constants';
import { leaders } from '@/lib/tally';

export function WinnerVeil({ options, counts }: { options: string[]; counts: number[] }) {
  const top = leaders(counts);
  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div className="frozen-veil">
      <div className="winner">
        <div className="kicker">Frozen</div>
        {top.length === 0 ? (
          <div className="name" style={{ color: 'var(--muted)' }}>
            No votes
          </div>
        ) : (
          top.map((w) => (
            <div key={w} className="name" style={{ color: WEDGE_COLORS[w] }}>
              {options[w]}
            </div>
          ))
        )}
        {top.length > 0 && (
          <div className="score tabular">
            {counts[top[0]]} of {total} {top.length > 1 ? '— tied' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
