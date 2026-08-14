// src/app/robots.ts
import type { MetadataRoute } from 'next'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.woorri.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/edit/',
          '/login/',
          '/reset-password/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
