'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function EditPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [site, setSite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login');
        return;
      }
      supabase.from('sites').select('*').eq('slug', slug).maybeSingle().then(({ data: siteData }) => {
        setSite(siteData);
        setLoading(false);
      });
    });
  }, [slug]);

  const updateField = (field: string, value: string) => {
    setSite({ ...site, [field]: value });
  };

  const handleImageUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage('');
    const ext = file.name.split('.').pop();
    const path = `${slug}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('site-images').upload(path, file);
    if (uploadError) {
      setMessage('Upload error: ' + uploadError.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from('site-images').getPublicUrl(path);
    setSite({ ...site, hero_image: data.publicUrl });
    setUploading(false);
    setMessage('Image uploaded! Click Save Changes to keep it.');
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const { error } = await supabase
      .from('sites')
      .update({
        name: site.name,
        slogan: site.slogan,
        type: site.type,
        about: site.about,
        hero_title: site.hero_title,
        hero_subtitle: site.hero_subtitle,
        primary_color: site.primary_color,
        hero_image: site.hero_image,
      })
      .eq('slug', slug);
    setSaving(false);
    if (error) {
      setMessage('Error: ' + error.message);
    } else {
      setMessage('Saved!');
    }
  };

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center', fontFamily: 'sans-serif' }}>Loading...</div>;
  if (!site) return <div style={{ padding: '4rem', textAlign: 'center', fontFamily: 'sans-serif' }}>Site not found.</div>;

  const labelStyle = { fontWeight: '600', fontSize: '0.8rem', color: '#555', letterSpacing: '0.03em' } as const;
  const inputStyle = { padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', width: '100%', boxSizing: 'border-box' } as const;

  return (
    <div style={{ fontFamily: 'sans-serif', minHeight: '100vh', background: '#f9f9f9' }}>
      <nav style={{ background: '#6366f1', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/dashboard" style={{ color: 'white', fontSize: '1.1rem', fontWeight: '700', textDecoration: 'none' }}>&larr; Dashboard</Link>
        <Link href={`/sites/${slug}`} style={{ color: 'white', fontSize: '0.9rem', textDecoration: 'none' }}>View Site &rarr;</Link>
      </nav>

      <div style={{ maxWidth: '700px', margin: '3rem auto', padding: '0 2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '900', marginBottom: '2rem' }}>Edit {site.name}</h1>

        <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={labelStyle}>HERO IMAGE</span>
            {site.hero_image && (
              <img src={site.hero_image} alt="hero" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '0.5rem' }} />
            )}
            <label style={{ background: '#eef2ff', color: '#4f46e5', padding: '0.75rem', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' }}>
              {uploading ? 'Uploading...' : 'Upload an image'}
              <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={labelStyle}>BUSINESS NAME</span>
            <input value={site.name || ''} onChange={(e) => updateField('name', e.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={labelStyle}>TYPE</span>
            <input value={site.type || ''} onChange={(e) => updateField('type', e.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={labelStyle}>SLOGAN</span>
            <input value={site.slogan || ''} onChange={(e) => updateField('slogan', e.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={labelStyle}>HERO TITLE</span>
            <input value={site.hero_title || ''} onChange={(e) => updateField('hero_title', e.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={labelStyle}>HERO SUBTITLE</span>
            <input value={site.hero_subtitle || ''} onChange={(e) => updateField('hero_subtitle', e.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={labelStyle}>ABOUT</span>
            <textarea value={site.about || ''} onChange={(e) => updateField('about', e.target.value)} rows={4} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={labelStyle}>PRIMARY COLOR</span>
            <input type="color" value={site.primary_color || '#6366f1'} onChange={(e) => updateField('primary_color', e.target.value)} style={{ width: '80px', height: '44px', borderRadius: '8px', border: '1px solid #ddd', cursor: 'pointer' }} />
          </label>

          <button onClick={handleSave} disabled={saving} style={{ background: '#6366f1', color: 'white', border: 'none', padding: '0.85rem', borderRadius: '8px', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>

          {message && (
            <p style={{ textAlign: 'center', fontWeight: '700', color: message.startsWith('Error') || message.startsWith('Upload error') ? '#dc2626' : '#16a34a' }}>{message}</p>
          )}

        </div>
      </div>
    </div>
  );
}
