import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-white/8 py-10 px-6" style={{ background: 'rgba(10,5,14,0.8)' }}>
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">

        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm"
            style={{ background: 'radial-gradient(circle at 30% 30%, #4F6EF5 0%, transparent 60%), radial-gradient(circle at 70% 70%, #E07040 0%, transparent 60%), #16090e' }}
          >
            N
          </div>
          <span className="font-black text-sm text-nexiora">nexiora</span>
        </div>

        <p className="text-white/30 text-xs text-center">
          © 2026 Nexiora AI. All rights reserved.
        </p>

        <div className="flex gap-6 text-xs text-white/40">
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
        </div>

      </div>
    </footer>
  );
}
