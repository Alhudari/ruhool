// I18N-03 — direction detection middleware
// Reads the `ruhool-lang` cookie (or `Accept-Language` header as a fallback)
// and forwards a `x-ruhool-lang` request header to the app so `app/layout.tsx`
// can render `<html lang dir>` correctly on the server and eliminate the
// ~100ms FOUC caused by the client-side boot script.
//
// The boot script in `app/layout.tsx` remains as a no-op fallback for users
// who switch language at runtime without a full reload.

import { NextResponse, type NextRequest } from 'next/server';

const SUPPORTED_LANGS = new Set(['ar', 'en']);

function pickLang(req: NextRequest): 'ar' | 'en' {
  const cookie = req.cookies.get('ruhool-lang')?.value;
  if (cookie && SUPPORTED_LANGS.has(cookie)) return cookie as 'ar' | 'en';
  const accept = req.headers.get('accept-language') ?? '';
  // Very small parser: look for ar-* before en-*.
  const first = accept.split(',')[0]?.trim().toLowerCase() ?? '';
  if (first.startsWith('ar')) return 'ar';
  return 'en';
}

export function middleware(req: NextRequest) {
  const lang = pickLang(req);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-ruhool-lang', lang);
  requestHeaders.set('x-ruhool-dir', lang === 'ar' ? 'rtl' : 'ltr');
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Exclude Next internals and static assets.
  matcher: ['/((?!_next/|api/|favicon|icons/|manifest\\.json|sw\\.js).*)'],
};
