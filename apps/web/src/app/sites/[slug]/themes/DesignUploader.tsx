'use client';

import { useState, useRef } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';

interface Props {
  onDesignUploaded: (url: string | null) => void;
  primary?: string;
  lang?: string;
}

const LABELS: Record<string, Record<string, string>> = {
  en: {
    title: 'Upload your design',
    hint: 'PNG, JPG or SVG — max 10 MB',
    dragHint: 'Drag & drop or click to browse',
    uploading: 'Uploading...',
    remove: 'Remove',
    error: 'Upload failed, please try again',
  },
  fr: {
    title: 'Uploadez votre design',
    hint: 'PNG, JPG ou SVG — max 10 Mo',
    dragHint: 'Glissez-deposez ou cliquez pour parcourir',
    uploading: 'Envoi en cours...',
    remove: 'Supprimer',
    error: 'Echec, veuillez reessayer',
  },
};

export default function DesignUploader({ onDesignUploaded, primary = '#111', lang = 'en' }: Props) {
  const t = LABELS[lang] || LABELS.en;
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      onDesignUploaded(data.url);
    } catch {
      setError(t.error);
      onDesignUploaded(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleRemove = () => {
    setPreview(null);
    onDesignUploaded(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6 }}>{t.title}</p>
      {preview ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={preview} alt="Design" style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 10, border: '2px solid ' + primary }} />
          <button
            onClick={handleRemove}
            style={{ position: 'absolute', top: -8, right: -8, background: '#e00', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          ><X size={14} /></button>
        </div>
      ) : (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: '2px dashed ' + primary + '40', borderRadius: 12, padding: '24px 16px',
            textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
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
