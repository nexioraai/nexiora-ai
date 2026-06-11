'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { X, Printer, QrCode } from 'lucide-react'

const C = {
  bg2: '#0a0704', panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}

export default function QRCodeView({ code, label, onClose }: { code: string; label?: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    if (!code) return
    // QR généré en sombre sur fond clair pour impression nette
    QRCode.toDataURL(code, { width: 320, margin: 2, color: { dark: '#1a1208', light: '#ffffff' } })
      .then(setDataUrl)
      .catch(() => setDataUrl(''))
  }, [code])

  const print = () => {
    if (!dataUrl) return
    const w = window.open('', '_blank', 'width=400,height=500')
    if (!w) return
    w.document.write(`
      <html><head><title>QR ${code}</title></head>
      <body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui">
        <img src="${dataUrl}" style="width:300px;height:300px" />
        <div style="margin-top:12px;font-size:18px;font-weight:700;font-family:monospace;letter-spacing:1px">${code}</div>
        ${label ? `<div style="margin-top:4px;font-size:14px;color:#555">${label}</div>` : ''}
        <script>window.onload=()=>{window.print();}<\/script>
      </body></html>
    `)
    w.document.close()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg2, border: `1px solid ${C.panelBorder}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <QrCode size={18} color={C.accent} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.cream }}>QR Code</h3>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint }}><X size={20} /></button>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: 16, display: 'inline-block' }}>
          {dataUrl ? (
            <img src={dataUrl} alt={code} style={{ width: 240, height: 240, display: 'block' }} />
          ) : (
            <div style={{ width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>…</div>
          )}
        </div>

        <div style={{ marginTop: 14, fontSize: 15, fontFamily: 'monospace', letterSpacing: 1, color: C.cream, fontWeight: 700 }}>{code}</div>
        {label && <div style={{ marginTop: 4, fontSize: 12.5, color: C.muted }}>{label}</div>}

        <button onClick={print} disabled={!dataUrl} style={{ marginTop: 18, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', opacity: dataUrl ? 1 : 0.5 }}>
          <Printer size={16} /> Imprimer l'étiquette
        </button>
      </div>
    </div>
  )
}
