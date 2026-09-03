'use client';
import Link from 'next/link';
import { useTranslation } from '@/lib/translations';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-white/8 py-10 px-6" style={{ background: 'rgba(10,5,14,0.8)' }}>
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">

        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm"
            style={{ background: 'radial-gradient(circle at 30% 30%, #4F6EF5 0%, transparent 60%), radial-gradient(circle at 70% 70%, #FA5D1E 0%, transparent 60%), #16090e' }}
          >
            W
          </div>
          <span className="font-black text-sm text-nexiora">deribfy</span>
        </div>

        <p className="text-white/30 text-xs text-center">
          {t('footer.copyright')}
        </p>

        <div className="flex flex-wrap gap-6 text-xs text-white/40 justify-center">
          <Link href="/about" className="hover:text-white transition-colors">{t('footer.about')}</Link>
          <Link href="/pricing" className="hover:text-white transition-colors">{t('footer.pricing')}</Link>
          <a href="mailto:contact@deribfy.com" className="hover:text-white transition-colors">{t('footer.contact')}</a>
          <Link href="/privacy" className="hover:text-white transition-colors">{t('footer.privacy')}</Link>
          <Link href="/terms" className="hover:text-white transition-colors">{t('footer.terms')}</Link>
          <Link href="/cookies" className="hover:text-white transition-colors">{t('footer.cookies')}</Link>
        </div>

      </div>
    </footer>
  );
}
