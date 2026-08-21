import { NextResponse } from 'next/server';
import { HOST_COOKIE, constantTimeEqual, hostToken, sameOrigin } from '@/lib/hostAuth';
import { clientKey, rateLimit } from '@/lib/rateLimit';

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  }

  // The passcode is the one guessable credential in the system, so cap the
  // guesses before checking it -- a wrong answer must cost the same whether it
  // is the first attempt or the thousandth.
  const limit = rateLimit(clientKey(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
    );
  }

  const { passcode } = (await request.json().catch(() => ({}))) as { passcode?: string };
  const expected = process.env.HOST_PASSCODE;

  if (!expected || typeof passcode !== 'string' || !constantTimeEqual(passcode, expected)) {
    return NextResponse.json({ error: 'Wrong passcode' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(HOST_COOKIE, hostToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  return response;
}
