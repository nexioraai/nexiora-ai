'use client';
import { useTranslation, type Lang } from '@/lib/translations';

export default function LanguageSwitcher() {
  const { lang, setLang } = useTranslation();

  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 hover:text-white focus:outline-none focus:border-[#E07040] cursor-pointer transition-colors"
      aria-label="Language"
    >
      <option value="fr">🇫🇷 FR</option>
      <option value="en">🇬🇧 EN</option>
    </select>
  );
}
