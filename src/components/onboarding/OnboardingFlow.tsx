'use client'

import { useState } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'

export default function OnboardingFlow({ onComplete }: { onComplete?: (data: any) => void }) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState({
    type: '',
    name: '',
    slogan: '',
    theme: 'EditorialTheme',
    primary_color: '#d97a4f',
  })

  const siteTypes = [
    { id: 'restaurant', label: '🍽️ Restaurant', icon: '🍽️' },
    { id: 'shop', label: '🛍️ E-commerce', icon: '🛍️' },
    { id: 'portfolio', label: '🎨 Portfolio', icon: '🎨' },
    { id: 'agency', label: '🚀 Agency', icon: '🚀' },
    { id: 'services', label: '💼 Services', icon: '💼' },
    { id: 'blog', label: '✍️ Blog', icon: '✍️' },
  ]

  const themes = [
    { id: 'EditorialTheme', name: 'Editorial', desc: 'Élégant & minimaliste' },
    { id: 'BoldTheme', name: 'Bold', desc: 'Audacieux & impactant' },
    { id: 'MonochromeTheme', name: 'Monochrome', desc: 'Épuré & moderne' },
  ]

  const colors = [
    '#d97a4f', '#FF3B1F', '#4F6EF5', '#10B981', '#F59E0B', '#8B5CF6',
  ]

  const handleNext = () => {
    if (step < 3) setStep(step + 1)
    else { if (onComplete) onComplete(data); else console.log("Site data:", data); }
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const isStepValid = () => {
    if (step === 1) return data.type !== ''
    if (step === 2) return data.name.trim() !== ''
    if (step === 3) return data.theme && data.primary_color
    return false
  }

  return (
    <div className="min-h-screen nexiora-bg flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <span className="text-white/60 text-sm">Étape {step} de 3</span>
            <span className="text-white/40 text-sm">{Math.round((step / 3) * 100)}%</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#4F6EF5] to-[#d97a4f] transition-all duration-500"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="text-4xl font-black text-white mb-4">Quel est ton projet?</h2>
            <p className="text-white/60 mb-8">Choisis le type de site qui te convient</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {siteTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setData({ ...data, type: type.id })}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    data.type === type.id
                      ? 'border-[#d97a4f] bg-[#d97a4f]/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20'
                  }`}
                >
                  <div className="text-3xl mb-2">{type.icon}</div>
                  <div className="text-sm font-semibold">{type.label.split(' ')[1]}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="animate-fade-in">
            <h2 className="text-4xl font-black text-white mb-4">Parlons de ton site</h2>
            <p className="text-white/60 mb-8">Donne-nous quelques infos de base</p>
            <div className="space-y-6">
              <div>
                <label className="block text-white/80 text-sm font-medium mb-3">
                  Nom du site *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Ousma Kintaki"
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                />
              </div>
              <div>
                <label className="block text-white/80 text-sm font-medium mb-3">
                  Slogan (optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Saveurs authentiques"
                  value={data.slogan}
                  onChange={(e) => setData({ ...data, slogan: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h2 className="text-4xl font-black text-white mb-4">Ton identité visuelle</h2>
            <p className="text-white/60 mb-8">Thème et couleur primaire</p>
            <div className="space-y-8">
              <div>
                <label className="block text-white/80 text-sm font-medium mb-4">Thème</label>
                <div className="grid md:grid-cols-3 gap-4">
                  {themes.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setData({ ...data, theme: theme.id })}
                      className={`p-5 rounded-xl border-2 transition-all text-left ${
                        data.theme === theme.id
                          ? 'border-[#d97a4f] bg-[#d97a4f]/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="font-semibold text-white mb-1">{theme.name}</div>
                      <div className="text-sm text-white/60">{theme.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-white/80 text-sm font-medium mb-4">Couleur</label>
                <div className="flex flex-wrap gap-4">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setData({ ...data, primary_color: color })}
                      className={`w-12 h-12 rounded-xl border-2 transition-transform ${
                        data.primary_color === color
                          ? 'border-white scale-110'
                          : 'border-white/20'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-4 mt-12">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 text-white/70 hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
            Retour
          </button>
          <button
            onClick={handleNext}
            disabled={!isStepValid()}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#4F6EF5] to-[#d97a4f] text-white font-semibold disabled:opacity-50"
          >
            {step === 3 ? 'Créer' : 'Suivant'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <style>{`
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in { animation: fade-in 0.3s ease-out; }
        `}</style>
      </div>
    </div>
  )
}
