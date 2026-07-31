'use client'

import { Palette } from 'lucide-react'
import { useTranslation } from '@/lib/translations'

interface ThemeSelectorProps {
  currentTheme: string
  onThemeChange: (theme: string) => void
}

export default function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  const { t } = useTranslation();
  const themes = [
    {
      id: 'editorial',
      name: 'Editorial',
      description: t('ts.editorial.desc'),
      preview: t('ts.editorial.preview'),
      colors: ['#111111', '#ffffff']
    },
    {
      id: 'noir',
      name: 'Noir',
      description: t('ts.noir.desc'),
      preview: t('ts.noir.preview'),
      colors: ['#17120C', '#C9A24B']
    },
    {
      id: 'vif',
      name: 'Vif',
      description: t('ts.vif.desc'),
      preview: t('ts.vif.preview'),
      colors: ['#EFE6D4', '#B08847']
    },
    {
      id: 'aurora',
      name: 'Aurora',
      description: t('ts.aurora.desc'),
      colors: ['#6366f1', '#f5c0d1']
    }
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Palette className="w-5 h-5 text-[#FA5D1E]" />
        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{t('ts.label')}</span>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => onThemeChange(theme.id)}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              currentTheme === theme.id
                ? 'border-[#FA5D1E] bg-[#FA5D1E]/10'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
          >
            <h4 className="font-semibold text-white mb-1">{theme.name}</h4>
            <p className="text-xs text-white/60 mb-3">{theme.description}</p>
            <div className="flex gap-2">
              {theme.colors.map((color, i) => (
                <div
                  key={i}
                  className="w-5 h-5 rounded border border-white/20"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
