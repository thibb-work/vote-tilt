import { NextResponse } from 'next/server';
import { HOST_COOKIE, constantTimeEqual, hostToken } from '@/lib/hostAuth';

export async function POST(request: Request) {
  const { passcode } = (await request.json().catch(() => ({}))) as { passcode?: string };
  const expected = process.env.HOST_PASSCODE;

  if (!expected || !passcode || !constantTimeEqual(passcode, expected)) {
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
