import { NextResponse } from 'next/server';
import { getSessionIdFromCookies, deleteStoredSession } from '@/lib/auth/cookies';

export async function POST() {
  const sessionId = await getSessionIdFromCookies();
  if (sessionId) {
    await deleteStoredSession(sessionId);
  }

  const cookieName = process.env.SESSION_COOKIE_NAME || 'socialencer_session';
  const response = NextResponse.json({
    message: 'ログアウトしました。',
    redirectUrl: '/login',
  });
  response.cookies.set(cookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
