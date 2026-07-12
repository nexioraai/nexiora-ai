import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

// ===== Content Security Policy =====
// Limite quelles sources de scripts/styles/images/connexions sont autorisées
const csp = [
  "default-src 'self'",
  // Iframes externes autorisees : carte OpenStreetMap dans la section Contact
  "frame-src 'self' https://www.openstreetmap.org",
  // Scripts : self + inline (Next.js hydration). 'unsafe-eval' uniquement en dev (Turbopack HMR)
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // Styles : self + inline (Tailwind utilise des styles inline)
  "style-src 'self' 'unsafe-inline'",
  // Images : self, data URIs (icons SVG inline), blob (preview uploads), Pexels, Supabase Storage
  "img-src 'self' data: blob: https://images.pexels.com https://*.supabase.co https://cf.cjdropshipping.com https://oss-cf.cjdropshipping.com https://cc-west-usa.oss-us-west-1.aliyuncs.com https://files.cdn.printful.com https://static.cdn.printful.com",
  // Fonts : self, data URIs
  "font-src 'self' data:",
  // Connexions fetch/XHR : self, Supabase (HTTP + websocket realtime). En dev, autoriser localhost pour HMR
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDev ? ' ws://localhost:* http://localhost:*' : ''}`,
  // Embedding : seulement notre propre origine (autorise futurs previews iframe internes)
  "frame-ancestors 'self'",
  // Empêche <base> de pointer ailleurs
  "base-uri 'self'",
  // Empêche les forms d'aller ailleurs
  "form-action 'self'",
  // Bloque Flash/Java/applets
  "object-src 'none'",
  // En prod, force HTTPS pour toutes les ressources
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

// ===== Tous les security headers =====
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Anti-clickjacking (cohérent avec frame-ancestors 'self')
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Empêche le browser de "deviner" un type MIME différent
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Force HTTPS pour 2 ans, inclut tous les sous-domaines, autorise le preload
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Limite ce qui est envoyé dans le header Referer aux sites tiers
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Désactive caméra, micro, géolocation, FLoC (Google's tracking)
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lefumezaxfsttigpmzhr.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
      },
      {
        protocol: 'https',
        hostname: 'cf.cjdropshipping.com',
      },
      {
        protocol: 'https',
        hostname: 'oss-cf.cjdropshipping.com',
      },
      {
        protocol: 'https',
        hostname: 'cc-west-usa.oss-us-west-1.aliyuncs.com',
      },
      {
        protocol: 'https',
        hostname: 'files.cdn.printful.com',
      },
    ],
  },
  async headers() {
    return [
      {
        // Appliquer les headers à toutes les routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
