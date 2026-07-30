'use client'

import { Palette } from 'lucide-react'

interface ThemeSelectorProps {
  currentTheme: string
  onThemeChange: (theme: string) => void
}

export default function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  const themes = [
    {
      id: 'editorial',
      name: 'Editorial',
      description: 'Élégant & minimaliste',
      preview: 'Serif typographie, design épuré',
      colors: ['#111111', '#ffffff']
    },
    {
      id: 'noir',
      name: 'Noir',
      description: 'Cinématique & luxueux',
      preview: 'Charbon & or, hero split, sections numérotées',
      colors: ['#17120C', '#C9A24B']
    },
    {
      id: 'vif',
      name: 'Vif',
      description: 'Éditorial & vivant',
      preview: 'Crème doré-beige, serif italique, parallax',
      colors: ['#EFE6D4', '#B08847']
    },
    {
      id: 'aurora',
      name: 'Aurora',
      description: 'E-commerce futuriste',
      colors: ['#6366f1', '#f5c0d1']
    }
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Palette className="w-5 h-5 text-[#FA5D1E]" />
        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Thème</span>
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
