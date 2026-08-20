'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase/client';
import { SESSION_SLUG } from './constants';
import type { SessionRow } from './types';

/**
 * The labels and the frozen flag, live. A freeze on the host screen lands on
 * every phone through postgres_changes without anyone refreshing.
 */
export function useSession(): SessionRow | null {
  const [session, setSession] = useState<SessionRow | null>(null);

  useEffect(() => {
    let alive = true;

    void supabase
      .from('sessions')
      .select('*')
      .eq('slug', SESSION_SLUG)
      .single()
      .then(({ data }) => {
        if (alive && data) setSession(data as SessionRow);
      });

    const channel = supabase
      .channel('session-watch')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `slug=eq.${SESSION_SLUG}`,
        },
        (payload) => setSession(payload.new as SessionRow),
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return session;
}
