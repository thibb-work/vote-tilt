'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase/client';
import { ROOM_CHANNEL } from './constants';
import { WEDGE_COUNT } from './tilt';
import { aggregatePresence, type PresenceEntry } from './presence';

/** How often a phone is allowed to publish a changed wedge. */
const PUBLISH_INTERVAL_MS = 120;

const zeros = () => new Array<number>(WEDGE_COUNT).fill(0);

export type RoomStatus = 'connecting' | 'live' | 'error';

export interface Room {
  counts: number[];
  /** phones present, including abstainers */
  total: number;
  status: RoomStatus;
  /** voters only: publish where this phone is pointing */
  setWedge: (wedge: number | null) => void;
}

/**
 * One Realtime Presence channel carries the whole room. Nothing here writes to
 * Postgres -- a fifty-phone room retilting constantly would otherwise be
 * thousands of writes a minute for state nobody needs to keep.
 *
 * Host screens pass publish=false so they observe without joining the tally.
 */
export function useRoom({ publish }: { publish: boolean }): Room {
  const [counts, setCounts] = useState<number[]>(zeros);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<RoomStatus>('connecting');

  const wedgeRef = useRef<number | null>(null);
  const sentRef = useRef<number | null | undefined>(undefined);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase.channel(ROOM_CHANNEL, {
      config: { presence: { key: crypto.randomUUID() } },
    });
    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const { counts: next, total: present } = aggregatePresence(
        channel.presenceState<PresenceEntry>(),
      );
      setCounts(next);
      setTotal(present);
    });

    let ticker: ReturnType<typeof setInterval> | null = null;

    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED') {
        setStatus('live');
        if (!publish) return;
        // Coalesce: a phone sweeping across the dial sends at most ~8 updates a
        // second, and only when the wedge actually changed.
        const flush = () => {
          if (sentRef.current === wedgeRef.current) return;
          sentRef.current = wedgeRef.current;
          void channel.track({ wedge: wedgeRef.current });
        };
        sentRef.current = undefined;
        flush();
        ticker = setInterval(flush, PUBLISH_INTERVAL_MS);
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        setStatus('error');
      }
    });

    return () => {
      if (ticker) clearInterval(ticker);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [publish]);

  const setWedge = useCallback((wedge: number | null) => {
    wedgeRef.current = wedge;
  }, []);

  return { counts, total, status, setWedge };
}
