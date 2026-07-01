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
      id: 'bold',
      name: 'Bold',
      description: 'Audacieux & impactant',
      preview: 'Typographie massive, contraste fort',
      colors: ['#ffffff', '#FF3B1F']
    },
    {
      id: 'monochrome',
      name: 'Monochrome',
      description: 'Épuré & moderne',
      preview: 'Noir & blanc, minimaliste',
      colors: ['#000000', '#ffffff']
    }
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Palette className="w-5 h-5 text-[#E07040]" />
        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Thème</span>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => onThemeChange(theme.id)}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              currentTheme === theme.id
                ? 'border-[#E07040] bg-[#E07040]/10'
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
