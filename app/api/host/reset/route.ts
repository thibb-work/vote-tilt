import { NextResponse } from 'next/server';
import { isHost, sameOrigin } from '@/lib/hostAuth';
import { reset } from '@/lib/firebase/session';

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  }
  if (!(await isHost())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await reset();
  } catch (error) {
    // Driver messages name paths and credentials. The host has no use for that
    // on a projector, and it is free reconnaissance if the screen is
    // photographed, so it stays in the server log.
    console.error(`${new URL(request.url).pathname} failed:`, error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
