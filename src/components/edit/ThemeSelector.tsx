'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
type ThemeKey = 'editorial' | 'bold' | 'monochrome';

type Props = {
  slug: string;
  currentTheme?: string | null;
  onSaved?: (theme: ThemeKey) => void;
};

function resolveTheme(value?: string | null): ThemeKey {
  if (value === 'bold') return 'bold';
  if (value === 'monochrome') return 'monochrome';
  return 'editorial';
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ThemeSelector({ slug, currentTheme, onSaved }: Props) {
  const initial = resolveTheme(currentTheme);
  const [selected, setSelected] = useState<ThemeKey>(initial);
  const [saving, setSaving] = useState(false);
  const [savedTheme, setSavedTheme] = useState<ThemeKey | null>(null);
  const [error, setError] = useState('');

  const handleSelect = async (theme: ThemeKey) => {
    if (theme === selected || saving) return;
    const previous = selected;
    setSelected(theme);
    setSaving(true);
    setError('');
    setSavedTheme(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Non connecté');

      const res = await fetch(`/api/sites/${slug}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ theme }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Échec de la sauvegarde');

      setSavedTheme(theme);
      onSaved?.(theme);
    } catch (err: any) {
      setError(err.message || 'Erreur');
      setSelected(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center min-h-[20px]">
        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Theme</span>
        {saving && <span className="text-xs text-slate-400">Saving…</span>}
        {error && <span className="text-xs text-red-400 font-semibold">{error}</span>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ThemeCard
          name="Editorial"
          isSelected={selected === 'editorial'}
          onClick={() => handleSelect('editorial')}
          preview={<EditorialPreview />}
        />
        <ThemeCard
          name="Bold"
          isSelected={selected === 'bold'}
          onClick={() => handleSelect('bold')}
          preview={<BoldPreview />}
        />
        <ThemeCard
          name="Monochrome"
          isSelected={selected === 'monochrome'}
          onClick={() => handleSelect('monochrome')}
          preview={<MonochromePreview />}
        />
      </div>

      {/* Feedback PERSISTANT — reste affiché après save */}
      {savedTheme && !saving && (
      <a

          href={`/sites/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 group flex items-center justify-between p-4 rounded-2xl bg-green-500/10 border border-green-500/30 hover:bg-green-500/15 transition-all"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-green-500/20 shrink-0">
              <span className="text-green-400 text-base font-bold">✓</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-green-400 truncate">
                Theme saved — {capitalize(savedTheme)}
              </div>
              <div className="text-xs text-slate-400">Click to view your site live</div>
            </div>
          </div>
          <span className="text-green-400 font-semibold shrink-0 ml-3 group-hover:translate-x-1 transition-transform">
            View Site →
          </span>
        </a>
      )}
    </div>
  );
}

function ThemeCard({
  name,
  isSelected,
  onClick,
  preview,
}: {
  name: string;
  isSelected: boolean;
  onClick: () => void;
  preview: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-2 rounded-2xl transition-all flex flex-col gap-2 ${
        isSelected
          ? 'bg-[#E07040]/10 ring-2 ring-[#E07040] shadow-[0_0_0_4px_rgba(224,112,64,0.1)]'
          : 'bg-white/[0.03] ring-1 ring-white/10 hover:ring-white/20'
      }`}
    >
      {preview}
      <div className="flex justify-between items-center px-1 gap-1">
        <span className="text-xs sm:text-sm font-semibold text-white truncate">{name}</span>
        {isSelected && (
          <span className="text-[9px] text-[#E07040] font-bold tracking-wider shrink-0">●</span>
        )}
      </div>
    </button>
  );
}

function EditorialPreview() {
  return (
    <div style={{ width: '100%', aspectRatio: '4 / 3', background: '#FAF7F2', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, "Times New Roman", serif', color: '#111' }}>
      <div style={{ fontSize: '6px', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '3px', opacity: 0.55 }}>The Daily</div>
      <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.1, marginBottom: '5px' }}>A timeless<br />brand</div>
      <div style={{ height: '1px', background: 'rgba(0,0,0,0.15)', marginBottom: '5px' }} />
      <div style={{ fontSize: '6px', lineHeight: 1.4, color: '#555' }}>Crafted with intention.</div>
      <div style={{ marginTop: 'auto', fontSize: '6px', borderBottom: '1px solid #111', alignSelf: 'flex-start', paddingBottom: '1px' }}>Read more →</div>
    </div>
  );
}

function BoldPreview() {
  return (
    <div style={{ width: '100%', aspectRatio: '4 / 3', background: '#0a0a0a', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, -apple-system, sans-serif', color: 'white' }}>
      <div style={{ fontSize: '6px', fontWeight: 900, letterSpacing: '0.15em', color: '#E07040', marginBottom: '3px' }}>NEXT GEN</div>
      <div style={{ fontSize: '13px', fontWeight: 900, lineHeight: 0.95, textTransform: 'uppercase', marginBottom: '5px' }}>BOLD.<br />FAST.</div>
      <div style={{ fontSize: '6px', color: '#aaa', marginBottom: '5px' }}>No fluff. Pure impact.</div>
      <div style={{ marginTop: 'auto', fontSize: '7px', fontWeight: 700, background: '#E07040', padding: '3px 6px', borderRadius: '3px', alignSelf: 'flex-start', letterSpacing: '0.05em' }}>GET STARTED →</div>
    </div>
  );
}

function MonochromePreview() {
  return (
    <div style={{ width: '100%', aspectRatio: '4 / 3', background: 'white', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, -apple-system, sans-serif', color: 'black', border: '1px solid black' }}>
      <div style={{ fontSize: '5px', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '3px', borderBottom: '1px solid black', paddingBottom: '2px', alignSelf: 'flex-start', fontWeight: 600 }}>01 — Brand</div>
      <div style={{ fontSize: '14px', fontWeight: 900, lineHeight: 0.9, textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '-0.03em' }}>Less is<br />more.</div>
      <div style={{ fontSize: '6px', color: '#555', marginBottom: '5px' }}>Pure form. Honest design.</div>
      <div style={{ marginTop: 'auto', fontSize: '6px', fontWeight: 700, background: 'black', color: 'white', padding: '3px 6px', alignSelf: 'flex-start', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Discover →</div>
    </div>
  );
}
