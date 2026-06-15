// src/app/sites/[slug]/ContactForm.tsx
'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Send, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase';
import { getDict } from './themes/i18n'

type Props = {
  slug: string
  brand?: string
  lang?: string
}

export default function ContactForm({ slug, brand = '#111111', lang }: Props) {
  const t = getDict(lang)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    const { error } = await supabase.from('messages').insert({
      site_slug: slug,
      name,
      email,
      message,
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('success')
      setName('')
      setEmail('')
      setMessage('')
      // Revert to idle after 4s
      setTimeout(() => setStatus('idle'), 4000)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-600 mb-6">
        {t.form.title}
      </div>

      <input
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.form.name}
        className="w-full px-5 py-4 rounded-xl border border-neutral-200 bg-white text-neutral-900 placeholder-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-4 focus:ring-neutral-900/5 transition-all"
      />

      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t.form.email}
        className="w-full px-5 py-4 rounded-xl border border-neutral-200 bg-white text-neutral-900 placeholder-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-4 focus:ring-neutral-900/5 transition-all"
      />

      <textarea
        required
        rows={5}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t.form.message}
        className="w-full px-5 py-4 rounded-xl border border-neutral-200 bg-white text-neutral-900 placeholder-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-4 focus:ring-neutral-900/5 transition-all resize-none"
      />

      <button
        type="submit"
        disabled={status === 'sending' || status === 'success'}
        className="group relative w-full py-4 rounded-xl text-white font-semibold shadow-lg hover:shadow-2xl hover:-translate-y-0.5 transition-all overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        style={{ backgroundColor: brand }}
      >
        <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <span className="relative inline-flex items-center justify-center gap-2">
          {status === 'sending' && t.form.sending}
          {status === 'success' && (
            <>
              <Check className="w-5 h-5" />
              {t.form.sent}
            </>
          )}
          {(status === 'idle' || status === 'error') && (
            <>
              {t.form.send}
              <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </span>
      </button>

      {status === 'error' && (
        <div className="text-sm text-red-600 px-1">
          {t.form.error} : {errorMsg || '…'}
        </div>
      )}
    </form>
  )
}
