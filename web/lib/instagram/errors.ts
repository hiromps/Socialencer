import { NextResponse } from 'next/server';
import {
  IgLoginBadPasswordError,
  IgLoginInvalidUserError,
  IgLoginTwoFactorRequiredError,
  IgResponseError,
} from 'instagram-private-api';

export class ClientMessageError extends Error {}

function logLoginError(error: unknown) {
  if (error instanceof IgResponseError) {
    console.warn('[instagram/login] Instagram response error:', {
      statusCode: error.response.statusCode,
      message: error.response.body?.message,
      errorType: error.response.body?.error_type,
    });
    return;
  }

  if (error instanceof Error) {
    console.warn('[instagram/login] Error:', {
      name: error.name,
      message: error.message,
    });
    return;
  }

  console.warn('[instagram/login] Unknown error:', typeof error);
}

export function handleLoginError(error: unknown): NextResponse {
  logLoginError(error);
  if (error instanceof IgLoginTwoFactorRequiredError) {
    const info = error.response.body.two_factor_info;
    const verificationMethod = info.totp_two_factor_on ? '0' : '1';
    return NextResponse.json(
      {
        message: `2FA required. ${verificationMethod === '1' ? 'SMS' : 'Authenticator app'} code needed.`,
        twoFactorRequired: true,
        twoFactorIdentifier: info.two_factor_identifier,
        verificationMethod,
        username: info.username,
      },
      { status: 202 },
    );
  }

  if (error instanceof IgLoginBadPasswordError) {
    const instagramMessage = error.response.body?.message || '';
    const message = instagramMessage.toLowerCase().includes('email')
      ? 'Instagram rejected this login and offered account recovery. The password may be correct, but the server login source is being treated as suspicious. Try approving the login in Instagram, wait a few minutes, or configure IG_PROXY with a residential proxy close to the account location.'
      : 'Incorrect password.';

    return NextResponse.json(
      {
        message,
        instagramMessage: instagramMessage || undefined,
        errorType: error.response.body?.error_type,
      },
      { status: 401 },
    );
  }

  if (error instanceof IgLoginInvalidUserError) {
    return NextResponse.json(
      { message: 'Instagram account not found.' },
      { status: 401 },
    );
  }

  if (error instanceof ClientMessageError) {
    return NextResponse.json(
      { message: error.message },
      { status: 400 },
    );
  }

  if (error instanceof IgResponseError) {
    return NextResponse.json(
      {
        message: error.response.body.message || 'Instagram login failed.',
        errorType: error.response.body.error_type,
      },
      { status: error.response.statusCode || 400 },
    );
  }

  const message = error instanceof Error ? error.message : 'Instagram login failed.';
  return NextResponse.json({ message }, { status: 500 });
}
