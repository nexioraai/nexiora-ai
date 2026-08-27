'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface ConfirmModalProps {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  isDangerous?: boolean
}

export default function ConfirmModal({ title, message, onConfirm, onCancel, isDangerous }: ConfirmModalProps) {
  const [isOpen, setIsOpen] = useState(true)

  const handleConfirm = () => {
    setIsOpen(false)
    onConfirm()
  }

  const handleCancel = () => {
    setIsOpen(false)
    onCancel()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-2xl p-6 max-w-sm w-full border border-white/10">
        <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
        <p className="text-white/70 mb-6">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 px-4 py-3 rounded-xl font-semibold transition ${
              isDangerous
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-[#FA5D1E] text-white hover:bg-[#FA5D1E]/80'
            }`}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}
