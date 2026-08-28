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
import { roomAuth, roomDb } from './firebase/client';
import { WEDGE_COUNT } from './tilt';
import { countsFrom } from './tally';
import { roomWatchState, type WatchState } from './roomWatch';
import type { PhoneReading } from './dots';

/** How often a phone republishes its position. Thirty phones at this rate was clean in load testing. */
const PUBLISH_INTERVAL_MS = 300;
/** How often the host recomputes and republishes the aggregate every phone reads. */
const TALLY_INTERVAL_MS = 250;
/** A phone whose last write is older than this is treated as gone. */
const STALE_MS = 6000;
/** How often a phone re-asks whether the room it is writing into is still being read. */
const WATCH_INTERVAL_MS = 1000;

const zeros = () => new Array<number>(WEDGE_COUNT).fill(0);

export type RoomStatus = 'connecting' | 'live' | 'error';
export type Role = 'voter' | 'host';

export interface Room {
  counts: number[];
  /** phones present, including those lying flat */
  total: number;
  status: RoomStatus;
  /**
   * voters only: whether a host screen is reading this room. Stays 'checking'
   * for the host, which is the screen doing the reading.
   */
  watch: WatchState;
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
 * Positions live in RTDB at rooms/<roomId>/phones/<uid>, one node per phone. The
 * room id is minted per round by the host and travels only in the QR code, so
 * the path cannot be derived from the public bundle; the node key is the
 * phone's anonymous uid, so the rules can refuse a phone that reaches for
 * somebody else's dot.
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
  const [watch, setWatch] = useState<WatchState>('checking');
  const [readings, setReadings] = useState<PhoneReading[]>([]);

  const pending = useRef<{ heading: number | null; magnitude: number }>({
    heading: null,
    magnitude: 0,
  });

  // Read inside intervals, where React state would be a stale closure.
  const socketUp = useRef(false);
  /** When a tally last landed here. Arrival time, not the host clock inside it. */
  const tallyAt = useRef<number | null>(null);
  /** When the grace clock last restarted: connect, reconnect, or waking up. Set
      by the effect, never during render -- a clock read is not a pure value. */
  const settledAt = useRef(0);

  useEffect(() => {
    // A different room is a fresh question. Nothing has been heard from it, and
    // the clock that decides whether that silence is worrying starts now. The
    // watch state itself is left to the ticker a moment later rather than reset
    // here, so this effect never sets state synchronously.
    socketUp.current = false;
    tallyAt.current = null;
    settledAt.current = Date.now();

    // No room id means no QR was scanned, so there is nowhere legitimate to
    // write and nothing to read. Stay disconnected rather than guessing a path.
    if (!roomId) return;

    let cancelled = false;
    const timers: ReturnType<typeof setInterval>[] = [];
    const cleanups: (() => void)[] = [];

    const connect = (identity: string) => {
      const db = roomDb();
      const phonesPath = `rooms/${roomId}/phones`;
      const tallyRef = ref(db, `rooms/${roomId}/tally`);

      // A dropped socket is the failure that matters here: an earlier transport
      // went quiet while still claiming to be live, so the dial looked frozen
      // with no way to tell. .info/connected is the authoritative signal.
      cleanups.push(
        onValue(ref(db, '.info/connected'), (snap) => {
          const up = snap.val() === true;
          // A socket that has only just come up has not had time to hear
          // anything, so restart the grace clock rather than let a reconnect
          // read as an empty room.
          if (up) settledAt.current = Date.now();
          socketUp.current = up;
          setStatus(up ? 'live' : 'connecting');
        }),
      );

      if (role === 'voter') {
        // Keyed by uid, not a random id: the rules only accept a write whose
        // node name matches the writer, so a phone cannot move anyone else.
        const mine = ref(db, `${phonesPath}/${identity}`);
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

        cleanups.push(
          onValue(tallyRef, (snap) => {
            const v = snap.val() as { c?: number[]; n?: number } | null;
            // The host rewrites this node on a timer whether or not anyone is
            // in the room, so an update landing is proof that a host screen is
            // watching this exact room -- see lib/roomWatch.ts. An empty
            // snapshot proves nothing, so it is not counted as one.
            if (v) tallyAt.current = Date.now();
            setCounts(Array.isArray(v?.c) && v.c.length === WEDGE_COUNT ? v.c : zeros());
            setTotal(typeof v?.n === 'number' ? v.n : 0);
          }),
          () => {
            void remove(mine);
          },
        );

        // A backgrounded tab has its timers throttled and its updates queued, so
        // a phone coming out of a pocket deserves the same grace as one that has
        // just reconnected.
        const onVisible = () => {
          if (document.visibilityState === 'visible') settledAt.current = Date.now();
        };
        document.addEventListener('visibilitychange', onVisible);
        cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));

        // Silence is not an event, so nothing else would ever notice it.
        timers.push(
          setInterval(() => {
            const now = Date.now();
            setWatch(
              roomWatchState({
                live: socketUp.current,
                msSinceTally: tallyAt.current === null ? null : now - tallyAt.current,
                msSinceSettled: now - settledAt.current,
              }),
            );
          }, WATCH_INTERVAL_MS),
        );
        return;
      }

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

      cleanups.push(
        onChildAdded(phonesRef, (s) => upsert(s.key, s.val())),
        onChildChanged(phonesRef, (s) => upsert(s.key, s.val())),
        onChildRemoved(phonesRef, (s) => {
          if (s.key) live.delete(s.key);
        }),
      );

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

      cleanups.push(() => cancelAnimationFrame(frame));
    };

    // The rules refuse every read and write until an identity exists, so there
    // is nothing worth setting up before the sign-in lands.
    roomAuth()
      .then((identity) => {
        if (!cancelled) connect(identity);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      timers.forEach(clearInterval);
      cleanups.forEach((fn) => fn());
    };
  }, [role, roomId]);

  const publish = useCallback((heading: number | null, magnitude: number) => {
    pending.current = { heading, magnitude };
  }, []);

  return { counts, total, status, watch, readings, publish };
}
