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
  const password = String(body.password || '');

  if (!username || !password) {
    return NextResponse.json(
      { message: 'ユーザー名とパスワードを入力してください。' },
      { status: 400 },
    );
  }

  const ig = createInstagramClient(username);

  try {
    await ig.simulate.preLoginFlow();
    const user = await ig.account.login(username, password);

    // Login succeeded (no 2FA). Store flow state for the complete step.
    const flowToken = randomBytes(24).toString('hex');
    const serializedState = await ig.state.serialize();
    delete serializedState.constants;

    await saveFlowState(flowToken, {
      igState: serializedState,
      username,
      password,
      userId: String(user.pk),
      step: 'postlogin',
      createdAt: Date.now(),
    });

    return NextResponse.json({
      flowToken,
      step: 'complete',
      message: `${username} としてログインしました。セットアップを完了します。`,
    });
  } catch (error) {
    if (error instanceof IgLoginTwoFactorRequiredError) {
      const info = error.response.body.two_factor_info;
      return NextResponse.json(
        {
          twoFactorRequired: true,
          twoFactorIdentifier: info.two_factor_identifier,
          verificationMethod: info.totp_two_factor_on ? '0' : '1',
          username: info.username,
          message: `2段階認証が必要です。${info.totp_two_factor_on ? '認証アプリ' : 'SMS'}のコードを入力してください。`,
        },
        { status: 202 },
      );
    }
    return handleLoginError(error);
  }
}
