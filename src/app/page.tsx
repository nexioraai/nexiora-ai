'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AIResponse = {
  name: string;
  slogan: string;
  type: string;
  primaryColor: string;
  services: string[];
  pages: string[];
  cta: string;
  slug: string;
  socialLinks: {
    instagram: string;
    whatsapp: string;
    facebook: string;
  };
};

const pageRoutes = {
  Home: '/',
  About: '/about',
  'About Us': '/about',
  Services: '/services',
  Contact: '/contact',
} as const;

export default function Home() {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<AIResponse | null>(null);
  const [editedResult, setEditedResult] = useState<AIResponse | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [location, setLocation] = useState('');
  const [language, setLanguage] = useState('fr');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || null);
      setAuthLoaded(true);
    });
  }, []);

  const hasUnsavedChanges =
    !!editedResult &&
    !!savedSnapshot &&
    JSON.stringify(editedResult) !== JSON.stringify(savedSnapshot);

  const sendMessage = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setEditedResult(null);
    setSavedSnapshot(null);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, owner_email: userEmail, location, language }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error('Reponse serveur invalide'); }
      if (!res.ok) throw new Error(data.error || 'Une erreur est survenue');
      const normalized = {
        ...data,
        services: (data.services || []).map((s) =>
          typeof s === 'string' ? s : (s.title || s.name || JSON.stringify(s))
        )
      };
      setResult(normalized);
      setEditedResult(normalized);
      setSavedSnapshot(normalized);
    } catch (err: any) {
      setError(err.message || 'Echec de generation');
    } finally {
      setLoading(false);
    }
  };

  const saveChanges = async () => {
    if (!editedResult || !hasUnsavedChanges) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Connecte-toi pour sauvegarder');
      const res = await fetch(`/api/sites/${editedResult.slug}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(editedResult),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Echec de sauvegarde');
      setSavedSnapshot(editedResult);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch  (err: any) {
      setSaveError(err.message || 'Echec de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const updateField = useCallback(
    (field: keyof AIResponse, value: any) => {
      if (!editedResult) return;
      setEditedResult({ ...editedResult, [field]: value });
    },
    [editedResult]
  );

  const updateService = useCallback(
    (index: number, value: string) => {
      if (!editedResult) return;
      const newServices = [...editedResult.services];
      newServices[index] = value;
      setEditedResult({ ...editedResult, services: newServices });
    },
    [editedResult]
  );

  const updateSocial = useCallback(
    (platform: keyof AIResponse['socialLinks'], value: string) => {
      if (!editedResult) return;
      setEditedResult({
        ...editedResult,
        socialLinks: {
          ...(editedResult.socialLinks || { instagram: '', whatsapp: '', facebook: '' }),
          [platform]: value,
        },
      });
    },
    [editedResult]
  );

  return (
    <main className="min-h-screen nexiora-bg text-white">
      <Navbar />
      <section className="text-center px-6 pt-24 pb-16">
        <div className="inline-block px-4 py-2 rounded-full bg-[#E07040]/20 text-[#E07040] text-sm mb-6">
          AI Website &amp; App Builder
        </div>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6">
          Build your business <br />
          <span className="text-nexiora">
            with AI
          </span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-8">
          Nexiora automatically creates websites, dashboards, and apps for entrepreneurs.
        </p>
        <div className="flex gap-4 justify-center">
          {!authLoaded ? (
            <div className="text-slate-500">Chargement...</div>
          ) : userEmail ? (
            <Link href="/dashboard" className="btn-nexiora px-8 py-3 rounded-xl font-semibold transition">
              My Dashboard
            </Link>
          ) : (
            <Link href="/login" className="btn-nexiora px-8 py-3 rounded-xl font-semibold transition">
              Sign In
            </Link>
          )}
          
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bg-white/3 border border-white/8 rounded-2xl p-8 backdrop-blur-sm">
          <h2 className="text-3xl font-bold mb-4 text-center">Generate Your Business</h2>
          <p className="text-slate-400 mb-6 text-center">Describe your business idea and let AI generate everything.</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Example: Build a modern Toyota dealership site..."
            maxLength={1000}
            className="w-full h-40 bg-black/30 border border-white/10 rounded-xl p-4 text-white placeholder-slate-500 resize-none focus:outline-none focus:border-[#E07040]"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">📍 Ville / Pays</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="ex: Montréal, Canada"
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#E07040]"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">🌐 Langue du site</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E07040]"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="ar">عربي</option>
              </select>
            </div>
          </div>
                    <button
            onClick={sendMessage}
            disabled={loading || !userEmail}
            className="w-full mt-5 btn-nexiora disabled:opacity-50 py-3 rounded-xl font-semibold transition"
          >
            {loading ? 'Generating with AI...' : !userEmail ? 'Sign in to Generate' : 'Generate My Business'}
          </button>

          {error && (
            <div className="mt-5 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400">
              {error}
            </div>
          )}

          {editedResult && (
            <div className="mt-8 bg-black/30 border border-white/10 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row gap-3">
                {hasUnsavedChanges && (
                <button
                  onClick={saveChanges}
                  disabled={!hasUnsavedChanges || saving}
                  className={`flex-1 px-6 py-3 rounded-xl font-semibold transition ${
                    hasUnsavedChanges
                      ? 'btn-nexiora text-white'
                      : 'bg-white/5 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {saving ? 'Sauvegarde...' : 'Sauvegarder mes modifications'}
                </button>
                )}
                <a
                  href={`/sites/${editedResult.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center btn-nexiora px-6 py-3 rounded-xl font-semibold text-white transition"
                >
                  Voir mon site
                </a>
              </div>

              {saveError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
                  {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-green-400 text-sm">
                  Modifications sauvegardees
                </div>
              )}

              <div className="mb-6">
                <span className="text-xs bg-blue-500/20 text-[#C9A84C] px-3 py-1 rounded-full">
                  {editedResult.type}
                </span>
              </div>

              <div className="mb-2">
                <label className="text-xs text-slate-500 uppercase tracking-wider">Business Name</label>
                <input
                  value={editedResult.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="text-4xl font-black text-[#E07040] bg-transparent border-b border-white/10 w-full focus:outline-none focus:border-[#E07040]"
                />
              </div>

              <div className="mb-6">
                <label className="text-xs text-slate-500 uppercase tracking-wider">Slogan</label>
                <input
                  value={editedResult.slogan}
                  onChange={(e) => updateField('slogan', e.target.value)}
                  className="text-slate-300 text-xl bg-transparent border-b border-white/10 w-full focus:outline-none focus:border-[#E07040]"
                />
              </div>

              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-2">Pages</h4>
                <div className="flex flex-wrap gap-2">
                  {editedResult.pages.map((page, i) => (
                    <Link
                      key={i}
                      href={pageRoutes[page as keyof typeof pageRoutes] || '/'}
                      className="bg-white/10 border border-white/10 px-4 py-1 rounded-full text-sm hover:bg-[#E07040]/20 transition"
                    >
                      {page}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-2">Services</h4>
                <div className="grid gap-3">
                  {editedResult.services.map((service, i) => (
                    <input
                      key={i}
                      value={service}
                      onChange={(e) => updateService(i, e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#E07040]"
                    />
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-2">Social Links</h4>
                <div className="grid gap-3">
                  <input
                    value={editedResult.socialLinks?.instagram || ''}
                    onChange={(e) => updateSocial('instagram', e.target.value)}
                    placeholder="Instagram URL"
                    className="bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#E07040]"
                  />
                  <input
                    value={editedResult.socialLinks?.whatsapp || ''}
                    onChange={(e) => updateSocial('whatsapp', e.target.value)}
                    placeholder="WhatsApp URL"
                    className="bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#E07040]"
                  />
                  <input
                    value={editedResult.socialLinks?.facebook || ''}
                    onChange={(e) => updateSocial('facebook', e.target.value)}
                    placeholder="Facebook URL"
                    className="bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#E07040]"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="text-xs text-slate-500 uppercase tracking-wider">Call to Action</label>
                <input
                  value={editedResult.cta}
                  onChange={(e) => updateField('cta', e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#E07040]"
                />
              </div>

              <button className="w-full btn-nexiora py-3 rounded-xl font-semibold transition">
                {editedResult.cta}
              </button>

            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
