import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '../styles/globals.css';
import { ClippyGate } from '@/components/help/clippy-gate';
import { GuardedNavProvider } from '@/lib/navigation/GuardedNavProvider';

export const metadata: Metadata = {
  title: 'Ruhool (رحول) — Multi-Agent Platform',
  description: 'Local-first multi-agent orchestration platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'رحول',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#7c5aed',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // iOS notch / Dynamic Island — content extends edge-to-edge
  // UX-01 (AUDIT.md): do not lock zoom — WCAG 1.4.4.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // I18N-03: middleware resolves language and dir and forwards them as
  // request headers so SSR renders the correct `<html lang dir>` up-front.
  const hdrs = headers();
  const lang = hdrs.get('x-ruhool-lang') === 'ar' ? 'ar' : 'en';
  const dir = hdrs.get('x-ruhool-dir') === 'rtl' ? 'rtl' : 'ltr';
  return (
    <html lang={lang} dir={dir} data-theme="claude-clean" suppressHydrationWarning>
      <head>
        {/* Preload the two Thmanyah Sans weights used by ~90% of the
            UI (Regular + Medium) so first paint doesn't flash system
            fallback. Other weights lazy-load on demand via @font-face. */}
        <link rel="preload" href="/fonts/thmanyah/sans/thmanyahsans-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/thmanyah/sans/thmanyahsans-Medium.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Set theme/lang before React hydrates to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('ruhool-theme') || 'claude-clean';
                  // TH-02 (AUDIT.md): migrate legacy theme id.
                  if (theme === 'vintage-terminal') {
                    theme = 'desert-caravan';
                    try { localStorage.setItem('ruhool-theme', theme); } catch(e) {}
                  }
                  var variant = localStorage.getItem('ruhool-variant') || 'dark';
                  var lang = localStorage.getItem('ruhool-language') || 'en';
                  document.documentElement.setAttribute('data-theme', theme);
                  document.documentElement.lang = lang;
                  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
                  var isDark = variant === 'dark' || (variant === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) document.documentElement.classList.add('dark');
                } catch(e) {}
              })();
            `,
          }}
        />
        {/* Register service worker for PWA */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen">
        <GuardedNavProvider>
          {children}
          <ClippyGate />
        </GuardedNavProvider>
      </body>
    </html>
  );
}
