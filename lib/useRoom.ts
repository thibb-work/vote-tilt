'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
  onValue,
  ref,
  remove,
  set,
} from 'firebase/database';
import { roomDb } from './firebase/client';
import { WEDGE_COUNT } from './tilt';
import { countsFrom } from './tally';
import type { PhoneReading } from './dots';

/** How often a phone republishes its position. Thirty phones at this rate was clean in load testing. */
const PUBLISH_INTERVAL_MS = 300;
/** How often the host recomputes and republishes the aggregate every phone reads. */
const TALLY_INTERVAL_MS = 250;
/** A phone whose last write is older than this is treated as gone. */
const STALE_MS = 6000;

const zeros = () => new Array<number>(WEDGE_COUNT).fill(0);

export type RoomStatus = 'connecting' | 'live' | 'error';
export type Role = 'voter' | 'host';

export interface Room {
  counts: number[];
  /** phones present, including those lying flat */
  total: number;
  status: RoomStatus;
  /** one entry per phone -- populated for the host only */
  readings: PhoneReading[];
  /** voters only: report where this phone is pointing right now */
  publish: (heading: number | null, magnitude: number) => void;
}

interface Wire {
  h?: number | null;
  m?: number;
  t?: number;
}

/**
 * Positions live in RTDB at rooms/<roomId>/phones/<id>, one node per phone. The
 * room id is minted per round by the host and travels only in the QR code, so
 * the path cannot be derived from the public bundle.
 *
 * The fan-out is deliberately asymmetric. If every phone watched every other
 * phone, thirty phones at three updates a second would be nine hundred
 * deliveries a second. Instead only the host reads the individual nodes; it
 * folds them into a single tally node that the phones read. That keeps voter
 * traffic flat as the room grows, and the host -- one screen on good wifi --
 * carries the only expensive subscription.
 *
 * Nothing here decides a vote. A phone publishes where it is pointing and keeps
 * publishing until the host freezes the round; the freeze is what turns live
 * positions into a result.
 */
export function useRoom({ role, roomId }: { role: Role; roomId: string | null }): Room {
  const [counts, setCounts] = useState<number[]>(zeros);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [readings, setReadings] = useState<PhoneReading[]>([]);

  const pending = useRef<{ heading: number | null; magnitude: number }>({
    heading: null,
    magnitude: 0,
  });

  useEffect(() => {
    // No room id means no QR was scanned, so there is nowhere legitimate to
    // write and nothing to read. Stay disconnected rather than guessing a path.
    if (!roomId) return;

    const db = roomDb();
    const phonesPath = `rooms/${roomId}/phones`;
    const tallyRef = ref(db, `rooms/${roomId}/tally`);

    // A dropped socket is the failure that matters here: the previous transport
    // went quiet while still claiming to be live, so the dial looked frozen with
    // no way to tell. .info/connected is the authoritative signal.
    const connRef = ref(db, '.info/connected');
    const offConn = onValue(connRef, (snap) => {
      setStatus(snap.val() === true ? 'live' : 'connecting');
    });

    const timers: ReturnType<typeof setInterval>[] = [];
    const cleanups: (() => void)[] = [offConn];

    if (role === 'voter') {
      const id = crypto.randomUUID();
      const mine = ref(db, `${phonesPath}/${id}`);
      void onDisconnect(mine).remove();

      let last = '';
      timers.push(
        setInterval(() => {
          const { heading, magnitude } = pending.current;
          const wire: Wire = {
            m: Math.round(magnitude * 10) / 10,
            t: Date.now(),
          };
          if (heading !== null) wire.h = Math.round(heading * 10) / 10;

          // Skip the write when nothing moved, but never skip so long that the
          // host ages this phone out -- hence the timestamp in the signature.
          const sig = `${wire.h ?? 'flat'}:${wire.m}`;
          const stale = Date.now() - (last ? Number(last.split('|')[1]) : 0) > STALE_MS / 2;
          if (sig === last.split('|')[0] && !stale) return;
          last = `${sig}|${Date.now()}`;

          void set(mine, wire);
        }, PUBLISH_INTERVAL_MS),
      );

      const offTally = onValue(tallyRef, (snap) => {
        const v = snap.val() as { c?: number[]; n?: number } | null;
        setCounts(Array.isArray(v?.c) && v.c.length === WEDGE_COUNT ? v.c : zeros());
        setTotal(typeof v?.n === 'number' ? v.n : 0);
      });

      cleanups.push(offTally, () => {
        void remove(mine);
      });
    } else {
      // Child events rather than a whole-collection read: thirty phones each
      // updating three times a second would otherwise mean ninety full
      // deserialisations of the entire room every second.
      const live = new Map<string, { heading: number | null; magnitude: number; t: number }>();
      const phonesRef = ref(db, phonesPath);

      const upsert = (key: string | null, val: Wire | null) => {
        if (!key || !val) return;
        live.set(key, {
          heading: typeof val.h === 'number' ? val.h : null,
          magnitude: typeof val.m === 'number' ? val.m : 0,
          t: typeof val.t === 'number' ? val.t : Date.now(),
        });
      };

      const offAdd = onChildAdded(phonesRef, (s) => upsert(s.key, s.val()));
      const offChg = onChildChanged(phonesRef, (s) => upsert(s.key, s.val()));
      const offDel = onChildRemoved(phonesRef, (s) => {
        if (s.key) live.delete(s.key);
      });

      // Commit to React once per frame instead of once per child event, so the
      // dots ease along smoothly rather than the room re-rendering ninety times
      // a second.
      let frame = 0;
      const tick = () => {
        const cutoff = Date.now() - STALE_MS;
        const next: PhoneReading[] = [];
        for (const [id, r] of live) {
          if (r.t < cutoff) {
            live.delete(id);
            continue;
          }
          next.push({ id, heading: r.heading, magnitude: r.magnitude });
        }
        setReadings(next);
        setCounts(countsFrom(next));
        setTotal(next.length);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);

      timers.push(
        setInterval(() => {
          const cutoff = Date.now() - STALE_MS;
          const alive: PhoneReading[] = [];
          for (const [id, r] of live) {
            if (r.t >= cutoff) alive.push({ id, heading: r.heading, magnitude: r.magnitude });
          }
          void set(tallyRef, { c: countsFrom(alive), n: alive.length, t: Date.now() });
        }, TALLY_INTERVAL_MS),
      );

      cleanups.push(offAdd, offChg, offDel, () => cancelAnimationFrame(frame));
    }

    return () => {
      timers.forEach(clearInterval);
      cleanups.forEach((fn) => fn());
    };
  }, [role, roomId]);

  const publish = useCallback((heading: number | null, magnitude: number) => {
    pending.current = { heading, magnitude };
  }, []);

  return { counts, total, status, readings, publish };
}
