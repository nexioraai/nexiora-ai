import Link from 'next/link'
import { headers } from 'next/headers'
import { fetchSiteBrandByDomain } from './themes/shared'

const COPY: Record<string, { title: string; body: string; cta: string }> = {
  fr: {
    title: 'Page introuvable',
    body: "Cette page n'existe pas ou a été déplacée.",
    cta: "Retour à l'accueil",
  },
  en: {
    title: 'Page not found',
    body: 'This page does not exist or has been moved.',
    cta: 'Back to home',
  },
  ar: {
    title: 'الصفحة غير موجودة',
    body: 'هذه الصفحة غير موجودة أو تم نقلها.',
    cta: 'العودة إلى الصفحة الرئيسية',
  },
  es: {
    title: 'Página no encontrada',
    body: 'Esta página no existe o ha sido movida.',
    cta: 'Volver al inicio',
  },
}

export default async function SiteNotFound() {
  const h = await headers()
  const host = (h.get('host') || '').split(':')[0].toLowerCase()

  const brand = host ? await fetchSiteBrandByDomain(host) : null

  const accent = brand?.primaryColor || '#6366f1'
  const lang = (brand?.lang || 'fr').slice(0, 2)
  const t = COPY[lang] || COPY.fr

  return (
    <main
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="relative min-h-screen flex items-center justify-center overflow-hidden px-6"
      style={{ backgroundColor: '#08080b', color: '#f5f5f7' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          width: 620,
          height: 620,
          background: `radial-gradient(circle, ${accent}33 0%, transparent 68%)`,
          filter: 'blur(72px)',
        }}
      />

      <div className="relative z-10 w-full max-w-md text-center">
        {brand?.name && (
          <div className="mb-10 text-xs uppercase tracking-[0.25em] text-white/45">
            {brand.name}
          </div>
        )}

        <div
          className="mb-6 select-none font-semibold leading-none"
          style={{
            fontSize: 'clamp(5rem, 22vw, 9rem)',
            color: 'transparent',
            backgroundImage: `linear-gradient(160deg, #ffffff 12%, ${accent} 100%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
          }}
        >
          404
        </div>

        <h1 className="mb-3 text-2xl font-medium tracking-tight">{t.title}</h1>
        <p className="mb-10 text-sm leading-relaxed text-white/55">{t.body}</p>

        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-medium transition-transform hover:-translate-y-0.5"
          style={{
            border: `1px solid ${accent}66`,
            backgroundColor: `${accent}1a`,
            color: '#fff',
            boxShadow: `0 0 32px -8px ${accent}80`,
          }}
        >
          {t.cta}
        </Link>
      </div>
    </main>
  )
}
