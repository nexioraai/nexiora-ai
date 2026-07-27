'use client'
import { useEffect } from 'react'

export default function HtmlLang({ lang }: { lang: string | null | undefined }) {
  useEffect(() => {
    if (lang) document.documentElement.lang = lang
  }, [lang])
  return null
}
