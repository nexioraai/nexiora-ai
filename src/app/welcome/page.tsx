'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ExternalLink, LayoutDashboard } from 'lucide-react';

type Piece = {
  left: number; delay: number; dur: number;
  size: number; color: string; rotate: number;
};

function Confetti() {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    const colors = ['#4F6EF5', '#E07040', '#C9A84C', '#ffffff'];
    const next: Piece[] = Array.from({ length: 40 }).map((_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 2.5 + Math.random() * 1.5,
      size: 6 + Math.random() * 6,
      color: colors[i % colors.length],
      rotate: Math.random() * 360,
    }));
    setPieces(next);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: '-20px',
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 0.4}px`,
            background: p.color,
            borderRadius: '1px',
            transform: `rotate(${p.rotate}deg)`,
            animation: `nexiora-fall ${p.dur}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

function WelcomeContent() {
  const params = useSearchParams();
  const slug = params.get('slug');
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen nexiora-bg text-white flex items-center justify-center px-6">
      <style>{`
        @keyframes nexiora-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(540deg); opacity: 0; }
        }
        @keyframes nexiora-pop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes nexiora-check { to { stroke-dashoffset: 0; } }
      `}</style>

      <Confetti />

      <div
        className="relative z-10 max-w-md w-full text-center"
        style={{
          opacity: show ? 1 : 0,
          transform: show ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity .5s ease, transform .5s ease',
        }}
      >
        <div
          className="mx-auto mb-8 flex items-center justify-center rounded-full"
          style={{
            width: 96, height: 96,
            background: 'linear-gradient(135deg, #4F6EF5 0%, #E07040 60%, #C9A84C 100%)',
            animation: 'nexiora-pop .5s ease-out',
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M4 12.5L9.5 18L20 6.5" stroke="white" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 30, strokeDashoffset: 30,
                animation: 'nexiora-check .5s .35s ease forwards' }} />
          </svg>
        </div>

        <h1 className="text-3xl font-bold mb-3">Votre site est en ligne</h1>
        <p className="text-white/70 mb-10 leading-relaxed">
          Félicitations ! Votre abonnement est actif et votre site est désormais
          accessible au monde entier.
        </p>

        <div className="flex flex-col gap-3">
          {slug && (
            <Link href={`/sites/${slug}`}
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white transition-transform hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #4F6EF5 0%, #E07040 60%, #C9A84C 100%)' }}>
              <ExternalLink size={18} />
              Voir mon site
            </Link>
          )}
          <Link href="/dashboard"
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold border border-white/15 text-white/80 hover:text-white hover:border-white/30 transition-colors">
            <LayoutDashboard size={18} />
            Aller au tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen nexiora-bg" />}>
      <WelcomeContent />
    </Suspense>
  );
}
