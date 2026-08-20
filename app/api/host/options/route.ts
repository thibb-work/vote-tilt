import { NextResponse } from 'next/server';
import { isHost } from '@/lib/hostAuth';
import { hostRpc } from '@/lib/supabase/server';

export async function POST(request: Request) {
  if (!(await isHost())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { options } = (await request.json().catch(() => ({}))) as { options?: unknown };
  if (
    !Array.isArray(options) ||
    options.length !== 6 ||
    options.some((o) => typeof o !== 'string' || o.trim() === '')
  ) {
    return NextResponse.json({ error: 'Six non-empty labels required' }, { status: 400 });
  }

  const { client, secret } = hostRpc();
  const { error } = await client.rpc('host_set_options', {
    p_secret: secret,
    p_options: (options as string[]).map((o) => o.trim()),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
