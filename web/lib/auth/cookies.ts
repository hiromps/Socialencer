import { cookies } from 'next/headers';
import { getSession, deleteSession } from '@/lib/session/redis';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'socialencer_session';
const COOKIE_MAX_AGE = Number(process.env.SESSION_TTL_SECONDS || 86400);

// Get session ID from the HttpOnly cookie
export async function getSessionIdFromCookies(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

// Set the session cookie on a Response
export async function setSessionCookie(sessionId: string): Promise<{
  name: string;
  value: string;
  options: Record<string, unknown>;
}> {
  return {
    name: COOKIE_NAME,
    value: sessionId,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    },
  };
}

// Clear the session cookie
export async function clearSessionCookie(): Promise<{
  name: string;
  value: string;
  options: Record<string, unknown>;
}> {
  return {
    name: COOKIE_NAME,
    value: '',
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    },
  };
}

// Look up the full session from Redis using the cookie
export async function getStoredSession(sessionId: string) {
  return getSession(sessionId);
}

// Delete the session from Redis
export async function deleteStoredSession(sessionId: string) {
  return deleteSession(sessionId);
}
