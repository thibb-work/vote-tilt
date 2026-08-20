import { NextResponse } from 'next/server';
import { isHost } from '@/lib/hostAuth';
import { hostRpc } from '@/lib/supabase/server';

export async function POST() {
  if (!(await isHost())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { client, secret } = hostRpc();
  const { error } = await client.rpc('host_reset', { p_secret: secret });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
