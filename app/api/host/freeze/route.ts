import { NextResponse } from 'next/server';
import { isHost } from '@/lib/hostAuth';
import { hostRpc } from '@/lib/supabase/server';

/**
 * Tallies come from the host's browser because live votes live in Realtime
 * Presence, which the database cannot see. The cookie check is what makes that
 * safe to trust.
 */
export async function POST(request: Request) {
  if (!(await isHost())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tallies } = (await request.json().catch(() => ({}))) as {
    tallies?: Record<string, number>;
  };
  if (!tallies || typeof tallies !== 'object') {
    return NextResponse.json({ error: 'Missing tallies' }, { status: 400 });
  }

  const { client, secret } = hostRpc();
  const { error } = await client.rpc('host_freeze', {
    p_secret: secret,
    p_tallies: tallies,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
