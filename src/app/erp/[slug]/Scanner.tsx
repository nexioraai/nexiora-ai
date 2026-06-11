'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { X, ScanLine, CheckCircle2, AlertCircle } from 'lucide-react'

const C = {
  bg2: '#0a0704', panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}

export default function Scanner({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const [error, setError] = useState('')
  const [scanned, setScanned] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const startedRef = useRef(false)
  const elementId = 'qr-reader-region'

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const qr = new Html5Qrcode(elementId)
    scannerRef.current = qr

    qr.start(
      { facingMode: 'environment' }, // caméra arrière pour viser les produits
      { fps: 10, qrbox: { width: 230, height: 230 } },
      (decodedText) => {
        // Code lu avec succès
        setScanned(decodedText)
        qr.stop().catch(() => {})
        setTimeout(() => onResult(decodedText), 700)
      },
      () => {
        // erreurs de lecture par frame : ignorées (normal)
      }
    ).catch((err) => {
      setError("Impossible d'accéder à la caméra. Autorisez l'accès dans votre navigateur.")
    })

    return () => {
      const s = scannerRef.current
      if (s) {
        s.stop().catch(() => {}).finally(() => {
          try { s.clear() } catch {}
        })
      }
    }
  }, [onResult])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg2, border: `1px solid ${C.panelBorder}`, borderRadius: 18, padding: 22, width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ScanLine size={18} color={C.accent} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.cream }}>Scanner un code</h3>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint }}><X size={20} /></button>
        </div>

        {error ? (
          <div style={{ textAlign: 'center', padding: '30px 16px' }}>
            <AlertCircle size={34} color="#c75d5d" />
            <div style={{ marginTop: 12, fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>{error}</div>
          </div>
        ) : scanned ? (
          <div style={{ textAlign: 'center', padding: '30px 16px' }}>
            <CheckCircle2 size={40} color="#4ade80" />
            <div style={{ marginTop: 14, fontSize: 13, color: C.muted }}>Code détecté</div>
            <div style={{ marginTop: 6, fontSize: 15, fontFamily: 'monospace', letterSpacing: 1, color: C.cream, fontWeight: 700 }}>{scanned}</div>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
              <div id={elementId} style={{ width: '100%' }} />
              {/* Cadre de visée */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 200, height: 200, border: `2px solid ${C.accent}`, borderRadius: 16, boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)' }} />
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 12.5, color: C.muted, textAlign: 'center', lineHeight: 1.5 }}>
              Visez un QR code ou un code-barres<br />(produit fabricant ou étiquette d'emplacement)
            </div>
          </>
        )}
      </div>
    </div>
  )
}
