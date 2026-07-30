import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="nexiora-bg relative min-h-screen overflow-hidden flex items-center justify-center px-6 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md text-center">
        <div className="mb-10 text-xs uppercase tracking-[0.25em] text-white/45">
          Woorri
        </div>

        <div
          className="mb-6 select-none font-semibold leading-none"
          style={{
            fontSize: 'clamp(5rem, 22vw, 9rem)',
            color: 'transparent',
            backgroundImage:
              'linear-gradient(135deg, #4F6EF5 0%, #FA5D1E 60%, #C9A84C 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
          }}
        >
          404
        </div>

        <h1 className="mb-3 text-2xl font-medium tracking-tight">
          Page introuvable
        </h1>
        <p className="mb-10 text-sm leading-relaxed text-white/55">
          Cette page n&apos;existe pas ou a été déplacée.
        </p>

        <Link
          href="/"
          className="btn-nexiora inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-medium text-white"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  )
}
