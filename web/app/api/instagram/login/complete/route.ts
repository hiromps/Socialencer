import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { IgApiClient } from 'instagram-private-api';
import {
  getFlowState,
  deleteFlowState,
  saveSession,
  RedisSessionData,
} from '@/lib/session/redis';
import { buildSessionProfile } from '@/lib/instagram/profile-collector';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const flowToken = String(body.flowToken || '').trim();

  if (!flowToken) {
    return NextResponse.json(
      { message: 'セッションが見つかりません。もう一度ログインしてください。' },
      { status: 400 },
    );
  }

  const flowState = await getFlowState(flowToken);
  if (!flowState) {
    return NextResponse.json(
      { message: 'ログインフローが期限切れです。もう一度ログインしてください。' },
      { status: 410 },
    );
  }

  const ig = new IgApiClient();
  ig.state.generateDevice(flowState.username);
  ig.state.proxyUrl = process.env.IG_PROXY || '';
  await ig.state.deserialize(flowState.igState);

  try {
    // Complete session setup (21 API calls).
    // Some requests may fail (e.g. fbsearch 404) — this is harmless;
    // the session is already authenticated. Match the original server behaviour.
    try {
      await ig.simulate.postLoginFlow();
    } catch (error: any) {
      console.warn('[login/complete] postLoginFlow warning (non-fatal):', error?.message);
    }

    // Build profile (web login + scraping)
    const { profile, webSession } = await buildSessionProfile(
      ig,
      { username: flowState.username, pk: flowState.userId },
      flowState.password,
    );

    // Serialize the final authenticated state
    const finalState = await ig.state.serialize();
    delete finalState.constants;

    // Create session in Redis
    const sessionId = randomBytes(24).toString('hex');
    const sessionData: RedisSessionData = {
      profile,
      igState: finalState,
      web: webSession,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    await saveSession(sessionId, sessionData);

    // Clean up flow state
    await deleteFlowState(flowToken);

    // Build response with session cookie
    const cookieName = process.env.SESSION_COOKIE_NAME || 'socialencer_session';
    const cookieMaxAge = Number(process.env.SESSION_TTL_SECONDS || 86400);
    const response = NextResponse.json({
      message: `${profile.username} としてログインしました。`,
      redirectUrl: '/profile',
      profile,
    });
    response.cookies.set(cookieName, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: cookieMaxAge,
    });

    return response;
  } catch (error: any) {
    console.error('[login/complete] Error:', error?.message);
    return NextResponse.json(
      {
        message: `ログインの完了に失敗しました: ${error?.message || '不明なエラー'}`,
      },
      { status: 500 },
    );
  }
}
