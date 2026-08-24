import { NextResponse } from 'next/server';
import { isHost, sameOrigin } from '@/lib/hostAuth';
import { setOptions } from '@/lib/firebase/session';
import { MAX_OPTION_LEN } from '@/lib/constants';

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  }
  if (!(await isHost())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { options } = (await request.json().catch(() => ({}))) as { options?: unknown };
  if (
    !Array.isArray(options) ||
    options.length !== 6 ||
    options.some(
      (o) => typeof o !== 'string' || o.trim() === '' || o.trim().length > MAX_OPTION_LEN,
    )
  ) {
    return NextResponse.json(
      { error: `Six non-empty labels, each at most ${MAX_OPTION_LEN} characters` },
      { status: 400 },
    );
  }

  try {
    await setOptions((options as string[]).map((o) => o.trim()));
  } catch (error) {
    // Driver messages name paths and credentials. The host has no use for that
    // on a projector, and it is free reconnaissance if the screen is
    // photographed, so it stays in the server log.
    console.error(`${new URL(request.url).pathname} failed:`, error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
