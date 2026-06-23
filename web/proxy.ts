import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'socialencer_session';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(COOKIE_NAME);

  // Protected routes: require session
  const isProtected =
    pathname.startsWith('/profile') ||
    pathname.startsWith('/api/dashboard/');

  if (isProtected && !sessionCookie?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If already logged in, redirect /login to /profile
  if (pathname === '/login' && sessionCookie?.value) {
    return NextResponse.redirect(new URL('/profile', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/login', '/profile/:path*', '/api/dashboard/:path*'],
};
