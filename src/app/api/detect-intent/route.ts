import { NextRequest, NextResponse } from 'next/server'
import { detectIntent } from '@/ai/detect-intent'

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ type: 'website' })
    }

    const type = await detectIntent(message)
    return NextResponse.json({ type })
  } catch (err) {
    console.error('[/api/detect-intent] error:', err)
    return NextResponse.json({ type: 'website' }) // défaut sûr
  }
}
