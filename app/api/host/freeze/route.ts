import { NextResponse } from 'next/server';
import { isHost, sameOrigin } from '@/lib/hostAuth';
import { hostRpc } from '@/lib/supabase/server';
import { parseTallies } from '@/lib/tally';

/**
 * Tallies come from the host's browser because live positions ride RTDB, which
 * the database cannot see. The cookie says who is asking; parseTallies says
 * whether what they sent is a tally at all.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  }
  if (!(await isHost())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { tallies?: unknown };
  const tallies = parseTallies(body.tallies);
  if (!tallies) {
    return NextResponse.json({ error: 'Malformed tallies' }, { status: 400 });
  }

  const { client, secret } = hostRpc();
  const { error } = await client.rpc('host_freeze', {
    p_secret: secret,
    p_tallies: tallies,
  });
  if (error) {
    // Postgres messages name functions and columns. The host has no use for
    // that on a projector, and it is free reconnaissance if the screen is
    // photographed, so it stays in the server log.
    console.error(`${new URL(request.url).pathname} failed:`, error.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
