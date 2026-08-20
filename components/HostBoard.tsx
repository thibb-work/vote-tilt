'use client';

import { useState } from 'react';
import { CountUp } from './CountUp';
import { OptionsEditor } from './OptionsEditor';
import { QrPanel } from './QrPanel';
import { WEDGE_COLORS, FALLBACK_OPTIONS } from '@/lib/constants';
import { countsToTallies, leaders, talliesToCounts } from '@/lib/tally';
import { useRoom } from '@/lib/useRoom';
import { useSession } from '@/lib/useSession';

export function HostBoard() {
  const session = useSession();
  // publish: false -- the host watches the room without joining the tally.
  const room = useRoom({ publish: false });

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const options = session?.options ?? FALLBACK_OPTIONS;
  const frozen = session?.frozen ?? false;
  const counts = frozen ? talliesToCounts(session?.frozen_tallies) : room.counts;

  const voted = counts.reduce((a, b) => a + b, 0);
  const peak = Math.max(1, ...counts);
  const top = leaders(counts);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    setBusy(false);
  }

  return (
    <>
      <div className="host">
        <QrPanel />

        <section className="tally">
          <div className="tally-head">
            <h1>{frozen ? 'Frozen' : 'Tilt to vote'}</h1>
            <div className="status-line">
              <span className={`dot${room.status === 'live' ? '' : ' is-off'}`} />
              {room.total} {room.total === 1 ? 'phone' : 'phones'} · {voted} voting
            </div>
          </div>

          {options.map((label, w) => (
            <div key={w} className={`row${top.includes(w) ? ' is-leader' : ''}`}>
              <div
                className="row-bar"
                style={{ width: `${(counts[w] / peak) * 100}%`, background: WEDGE_COLORS[w] }}
              />
              <div className="row-label">
                <span className="chip" style={{ background: WEDGE_COLORS[w] }} />
                {label}
              </div>
              <div className={`row-count tabular${counts[w] ? '' : ' is-zero'}`}>
                <CountUp value={counts[w]} />
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="controls">
        {frozen ? (
          <button
            className="ctl is-primary"
            disabled={busy}
            onClick={() => post('/api/host/reset')}
          >
            Reset round
          </button>
        ) : (
          <button
            className="ctl is-primary"
            disabled={busy}
            onClick={() => post('/api/host/freeze', { tallies: countsToTallies(room.counts) })}
          >
            Freeze
          </button>
        )}
        <button className="ctl" disabled={busy || frozen} onClick={() => setEditing(true)}>
          Edit options
        </button>
      </div>

      {editing && <OptionsEditor options={options} onClose={() => setEditing(false)} />}
    </>
  );
}
