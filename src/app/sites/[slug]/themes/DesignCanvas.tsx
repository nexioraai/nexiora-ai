'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, Loader2, Move } from 'lucide-react';

interface DesignPosition {
  [key: string]: number;
  area_width: number;
  area_height: number;
  width: number;
  height: number;
  top: number;
  left: number;
}

interface Props {
  productImage?: string;
  variantId?: string;
  onDesignChange: (url: string | null, position: DesignPosition | null) => void;
  primary?: string;
  lang?: string;
}

const LABELS: Record<string, Record<string, string>> = {
  en: {
    title: 'Customize your product',
    hint: 'PNG, JPG or SVG — max 10 MB',
    dragHint: 'Drag & drop or click to browse',
    uploading: 'Uploading...',
    adjust: 'Drag to move · pinch or slider to resize',
    size: 'Size',
    remove: 'Remove',
    error: 'Upload failed, please try again',
  },
  fr: {
    title: 'Personnalisez votre produit',
    hint: 'PNG, JPG ou SVG — max 10 Mo',
    dragHint: 'Glissez-deposez ou cliquez pour parcourir',
    uploading: 'Envoi en cours...',
    adjust: 'Glissez pour deplacer · curseur pour redimensionner',
    size: 'Taille',
    remove: 'Supprimer',
    error: 'Echec, veuillez reessayer',
  },
};

// Print area as a fraction of the displayed product image (visual guide).
const AREA = { left: 0.30, top: 0.22, width: 0.40, height: 0.42 };

export default function DesignCanvas({ productImage, variantId, onDesignChange, primary = '#111', lang = 'en' }: Props) {
  const t = LABELS[lang] || LABELS.en;
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printArea, setPrintArea] = useState<{ area_width: number; area_height: number } | null>(null);
  // Design box in fractions of the print area (0..1)
  const [box, setBox] = useState({ x: 0.1, y: 0.1, scale: 0.8 });
  const [aspect, setAspect] = useState(1); // natural width / height of the design
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ mx: 0, my: 0, bx: 0, by: 0 });

  // Fetch the real print area dimensions for this variant
  useEffect(() => {
    if (!variantId) return;
    fetch(`/api/pod/printfile-info?variant_id=${variantId}`)
      .then(r => r.json())
      .then(d => { if (d.area_width) setPrintArea({ area_width: d.area_width, area_height: d.area_height }); })
      .catch(() => {});
  }, [variantId]);

  // Report url + printful-ready position upward
  const report = useCallback((url: string | null, b: typeof box) => {
    if (!url) { onDesignChange(null, null); return; }
    const aw = printArea?.area_width ?? 1800;
    const ah = printArea?.area_height ?? 2400;
    const w = Math.round(aw * b.scale);
    const h = Math.round(w / (aspect || 1)); // real design ratio, never assume square
    onDesignChange(url, {
      area_width: aw,
      area_height: ah,
      width: w,
      height: h,
      left: Math.max(0, Math.round(aw * b.x)),
      top: Math.max(0, Math.round(ah * b.y)),
    });
  }, [printArea, onDesignChange, aspect]);

  useEffect(() => { if (uploadedUrl) report(uploadedUrl, box); }, [box, uploadedUrl, report]);

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > 10 * 1024 * 1024) { setError(t.error); return; }
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) { setError(t.error); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/shop/upload-design', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(URL.createObjectURL(file));
      setUploadedUrl(data.url);
      report(data.url, box);
    } catch {
      setError(t.error);
      setUploadedUrl(null);
      onDesignChange(null, null);
    } finally {
      setUploading(false);
    }
  };

  // Vertical room depends on the design's rendered height, not on its width fraction
  const clampPos = useCallback((x: number, y: number, scale: number) => {
    const rect = areaRef.current?.getBoundingClientRect();
    const maxX = Math.max(0, 1 - scale);
    let maxY = Math.max(0, 1 - scale);
    if (rect && rect.width > 0 && rect.height > 0) {
      const heightPx = (scale * rect.width) / (aspect || 1);
      maxY = Math.max(0, 1 - heightPx / rect.height);
    }
    return {
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
    };
  }, [aspect]);

  const startDrag = (clientX: number, clientY: number) => {
    setDragging(true);
    dragStart.current = { mx: clientX, my: clientY, bx: box.x, by: box.y };
  };

  const onMove = useCallback((clientX: number, clientY: number) => {
    if (!dragging || !areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const dx = (clientX - dragStart.current.mx) / rect.width;
    const dy = (clientY - dragStart.current.my) / rect.height;
    setBox(b => ({
      ...b,
      ...clampPos(dragStart.current.bx + dx, dragStart.current.by + dy, b.scale),
    }));
  }, [dragging, clampPos]);

  useEffect(() => {
    if (!dragging) return;
    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); };
    const up = () => setDragging(false);
    window.addEventListener('mousemove', mm);
    window.addEventListener('touchmove', tm, { passive: false });
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('touchmove', tm);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, [dragging, onMove]);

  const handleRemove = () => {
    setPreview(null);
    setUploadedUrl(null);
    setBox({ x: 0.1, y: 0.1, scale: 0.8 });
    onDesignChange(null, null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6 }}>{t.title}</p>

      {preview && productImage ? (
        <div>
          <div style={{ position: 'relative', width: '100%', maxWidth: 360, margin: '0 auto', userSelect: 'none' }}>
            <img src={productImage} alt="" style={{ width: '100%', display: 'block', borderRadius: 12 }} draggable={false} />
            <div
              ref={areaRef}
              style={{
                position: 'absolute',
                left: `${AREA.left * 100}%`, top: `${AREA.top * 100}%`,
                width: `${AREA.width * 100}%`, height: `${AREA.height * 100}%`,
                border: `1px dashed ${primary}80`, borderRadius: 4,
              }}
            >
              <img
                src={preview}
                alt="Design"
                onLoad={e => {
                  const im = e.currentTarget;
                  if (im.naturalWidth && im.naturalHeight) setAspect(im.naturalWidth / im.naturalHeight);
                }}
                draggable={false}
                onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
                onTouchStart={e => { if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
                style={{
                  position: 'absolute',
                  left: `${box.x * 100}%`, top: `${box.y * 100}%`,
                  width: `${box.scale * 100}%`,
                  cursor: dragging ? 'grabbing' : 'grab',
                  objectFit: 'contain',
                  filter: dragging ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' : 'none',
                  transition: dragging ? 'none' : 'filter 0.2s',
                }}
              />
            </div>
          </div>

          <div style={{ maxWidth: 360, margin: '12px auto 0' }}>
            <p style={{ fontSize: 11, opacity: 0.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Move size={12} /> {t.adjust}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, opacity: 0.6, minWidth: 40 }}>{t.size}</span>
              <input
                type="range" min={20} max={100} value={Math.round(box.scale * 100)}
                onChange={e => {
                  const scale = Number(e.target.value) / 100;
                  setBox(b => ({ scale, ...clampPos(b.x, b.y, scale) }));
                }}
                style={{ flex: 1, accentColor: primary }}
              />
              <button
                onClick={handleRemove}
                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
              ><X size={12} /> {t.remove}</button>
            </div>
          </div>
        </div>
      ) : preview ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={preview} alt="Design" style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 10, border: `2px solid ${primary}` }} />
          <button
            onClick={handleRemove}
            style={{ position: 'absolute', top: -8, right: -8, background: '#e00', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          ><X size={14} /></button>
        </div>
      ) : (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${primary}40`, borderRadius: 12, padding: '24px 16px',
            textAlign: 'center', cursor: 'pointer',
          }}
        >
          {uploading ? (
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto', color: primary }} />
          ) : (
            <Upload size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
          )}
          <p style={{ fontSize: 13, margin: '4px 0 0', opacity: 0.6 }}>{uploading ? t.uploading : t.dragHint}</p>
          <p style={{ fontSize: 11, margin: '4px 0 0', opacity: 0.4 }}>{t.hint}</p>
        </div>
      )}

      {error && <p style={{ color: '#e00', fontSize: 12, marginTop: 6 }}>{error}</p>}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <style>{'@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'}</style>
    </div>
  );
}
