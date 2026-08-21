'use client';

import { useState, useSyncExternalStore } from 'react';
import { CountUp } from './CountUp';
import { Dial } from './Dial';
import { OptionsEditor } from './OptionsEditor';
import { QrPanel } from './QrPanel';
import { WEDGE_COLORS, FALLBACK_OPTIONS } from '@/lib/constants';
import { countsToTallies, leaders, talliesToCounts } from '@/lib/tally';
import { useRoom } from '@/lib/useRoom';
import { useSession } from '@/lib/useSession';
import { hostRoomIdSnapshot, retireHostRoomId, subscribeHostRoomId } from '@/lib/room';

export function HostBoard() {
  const session = useSession();

  // Null on the server: there is no room id until a browser mints one, and one
  // that appeared in server-rendered HTML would defeat the point of having it.
  const roomId = useSyncExternalStore(subscribeHostRoomId, hostRoomIdSnapshot, () => null);

  // The host watches every phone individually and never publishes a position of
  // its own, so it can draw the room without appearing in it.
  const room = useRoom({ role: 'host', roomId });

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = session?.options ?? FALLBACK_OPTIONS;
  const frozen = session?.frozen ?? false;
  const counts = frozen ? talliesToCounts(session?.frozen_tallies) : room.counts;

  const voted = counts.reduce((a, b) => a + b, 0);
  const peak = Math.max(1, ...counts);
  const top = leaders(counts);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      // A silent failure here is the worst case: the room believes it is locked
      // while the round is still open, so surface it on the projector instead.
      if (!res.ok) setError(`${path.split('/').pop()} failed (${res.status})`);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="host">
        <QrPanel roomId={roomId} />

        <div className="host-dial">
          <Dial
            options={options}
            counts={counts}
            active={null}
            heading={null}
            magnitude={0}
            total={room.total}
            showCounts
            readings={frozen ? [] : room.readings}
          />
        </div>

        <section className="tally">
          <div className="tally-head">
            <h1>{frozen ? 'Locked' : 'Tilt to vote'}</h1>
            <div className="status-line">
              <span className={`dot${room.status === 'live' ? '' : ' is-off'}`} />
              {room.total} {room.total === 1 ? 'phone' : 'phones'} · {voted} aiming
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

      {error && <p className="host-error">{error}</p>}

      <div className="controls">
        {frozen ? (
          <button
            className="ctl is-primary"
            disabled={busy}
            onClick={() => post('/api/host/reset')}
          >
            Reopen round
          </button>
        ) : (
          <button
            className="ctl is-primary"
            disabled={busy}
            onClick={() => post('/api/host/freeze', { tallies: countsToTallies(room.counts) })}
          >
            Lock votes
          </button>
        )}
        <button className="ctl" disabled={busy || frozen} onClick={() => setEditing(true)}>
          Edit options
        </button>
        <button
          className="ctl"
          disabled={busy}
          title="Mint a new join code. Everyone currently connected drops out."
          onClick={retireHostRoomId}
        >
          New QR
        </button>
      </div>

      {editing && <OptionsEditor options={options} onClose={() => setEditing(false)} />}
    </>
  );
}
