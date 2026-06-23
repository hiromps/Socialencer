import { NextRequest, NextResponse } from 'next/server';
import { getSessionIdFromCookies, getStoredSession } from '@/lib/auth/cookies';

export async function GET(request: NextRequest) {
  const sessionId = await getSessionIdFromCookies();
  if (!sessionId) {
    return NextResponse.json(
      { message: 'ログインしてください。', redirectUrl: '/login' },
      { status: 401 },
    );
  }

  const sessionData = await getStoredSession(sessionId);
  if (!sessionData) {
    return NextResponse.json(
      { message: 'セッションの有効期限が切れました。', redirectUrl: '/login' },
      { status: 401 },
    );
  }

  return NextResponse.json({ profile: sessionData.profile });
}
