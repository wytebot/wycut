import { NextRequest, NextResponse } from 'next/server';
import { getAllowedOrigin } from '@/lib/server/origin';

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  let allowedOrigin = getAllowedOrigin(origin);
  if (origin) { try { if (new URL(origin).origin === request.nextUrl.origin) allowedOrigin = origin; } catch { /* invalid origin stays disallowed */ } }
  if (request.method === 'OPTIONS' && request.nextUrl.pathname.startsWith('/api/')) {
    if (!allowedOrigin) return new NextResponse(null, { status: 403 });
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    });
  }
  const response = NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/') && allowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id');
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

export const config = { matcher: ['/api/:path*'] };
