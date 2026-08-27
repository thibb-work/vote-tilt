import type { NextConfig } from "next";

/**
 * Realtime traffic leaves the page over sockets to two providers, so connect-src
 * has to name both or the dial simply never fills. Wildcards rather than the
 * exact project hosts: the env vars are not guaranteed to be present at config
 * time, and a CSP that silently omits the database is worse than a broad one.
 */
const connect = [
  "'self'",
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://*.firebaseio.com',
  'wss://*.firebaseio.com',
  'https://*.firebasedatabase.app',
  'wss://*.firebasedatabase.app',
  'https://*.googleapis.com',
].join(' ');

// Next inlines its bootstrap, so script-src cannot drop 'unsafe-inline' without
// moving to per-request nonces. 'unsafe-eval' is dev-only -- the Turbopack HMR
// runtime needs it and the production bundle does not.
const scriptSrc =
  process.env.NODE_ENV === 'development'
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connect}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

/**
 * Where the QR code points when the origin the host is on turns out to be one a
 * phone cannot open. Vercel Authentication protects every URL of this project
 * except the production alias, so a host who opened the app from the dashboard
 * -- which always links the deployment URL -- would otherwise mint a code that
 * lands the room on a sign-in page.
 *
 * VERCEL_PROJECT_PRODUCTION_URL is the production alias, supplied by the
 * platform on every deployment, so this needs no configuration to be right.
 * Setting NEXT_PUBLIC_JOIN_ORIGIN by hand wins, which is what a custom domain
 * or a non-Vercel host would do. Empty is a valid answer: it means there is no
 * fallback, and the host screen says so rather than showing a dead code.
 */
const joinOrigin =
  process.env.NEXT_PUBLIC_JOIN_ORIGIN ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : '');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Computed above rather than read from the environment, so it has to be
  // inlined explicitly for the browser.
  env: { NEXT_PUBLIC_JOIN_ORIGIN: joinOrigin },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // The host screen shows live results and carries the host cookie;
          // framing it elsewhere is only ever someone else's idea.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The dial needs the motion sensors; nothing here needs anything else.
          {
            key: 'Permissions-Policy',
            value: 'accelerometer=(self), gyroscope=(self), camera=(), microphone=(), geolocation=(), payment=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
