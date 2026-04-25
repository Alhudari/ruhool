/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

// API URL — Railway in production, localhost in dev
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
const apiHost = new URL(apiUrl).origin;
const wsHost = apiHost.replace(/^http/, 'ws');

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self' ${apiHost} ${wsHost}${isDev ? ' ws://127.0.0.1:3000 http://127.0.0.1:3000' : ''}`,
  "img-src 'self' data: blob:",
  // Allow same-origin iframes (used by the SplitPaneArea multi-pane system).
  "frame-src 'self'",
  "frame-ancestors 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  // SAMEORIGIN (not DENY) so the platform can iframe its own routes for split-pane.
  // Cross-origin framing is still blocked by CSP frame-ancestors above.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

// Bundle analyzer: set ANALYZE=true to generate a treemap at
// `.next/analyze/*.html` on the next `next build`.
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
