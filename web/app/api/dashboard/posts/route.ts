import { NextRequest, NextResponse } from 'next/server';
import { getSessionIdFromCookies, getStoredSession } from '@/lib/auth/cookies';
import { fetchDashboardPosts } from '@/lib/instagram/post-fetcher';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const sessionId = await getSessionIdFromCookies();
  if (!sessionId) {
    return NextResponse.json(
      { message: 'Please log in.', redirectUrl: '/login' },
      { status: 401 },
    );
  }

  const sessionData = await getStoredSession(sessionId);
  if (!sessionData) {
    return NextResponse.json(
      { message: 'Session expired.', redirectUrl: '/login' },
      { status: 401 },
    );
  }

  try {
    const posts = await fetchDashboardPosts(sessionData);
    return NextResponse.json({ posts });
  } catch (error: any) {
    console.warn('[posts] Error:', error?.message);
    return NextResponse.json(
      { message: '投稿を読み込めませんでした。' },
      { status: 500 },
    );
  }
}
