import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { IgLoginTwoFactorRequiredError } from 'instagram-private-api';
import { saveFlowState } from '@/lib/session/redis';
import { createInstagramClient } from '@/lib/instagram/client';
import { handleLoginError } from '@/lib/instagram/errors';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const verificationCode = String(body.verificationCode || '').trim();
  const twoFactorIdentifier = String(body.twoFactorIdentifier || '').trim();
  const verificationMethod = String(body.verificationMethod || '1').trim() || '1';
  const remember = body.remember;

  if (!verificationCode) {
    return NextResponse.json(
      { message: '認証コードを入力してください。' },
      { status: 400 },
    );
  }

  const ig = createInstagramClient(username);

  try {
    // Must re-run preLoginFlow before 2FA login
    await ig.simulate.preLoginFlow();

    const user = await ig.account.twoFactorLogin({
      username,
      verificationCode,
      twoFactorIdentifier,
      verificationMethod,
      trustThisDevice: remember === false ? '0' : '1',
    });

    const flowToken = randomBytes(24).toString('hex');
    const serializedState = await ig.state.serialize();
    delete serializedState.constants;

    await saveFlowState(flowToken, {
      igState: serializedState,
      username,
      password: '',
      userId: String(user.pk),
      step: 'postlogin',
      createdAt: Date.now(),
    });

    return NextResponse.json({
      flowToken,
      step: 'complete',
      message: '認証成功。セットアップを完了します。',
    });
  } catch (error) {
    if (error instanceof IgLoginTwoFactorRequiredError) {
      return NextResponse.json(
        { message: '認証コードが正しくありません。', twoFactorRequired: true },
        { status: 400 },
      );
    }
    return handleLoginError(error);
  }
}
