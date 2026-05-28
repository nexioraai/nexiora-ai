'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

type AIResponse = {
  name: string;
  slogan: string;
  type: string;
  primaryColor: string;
  services: string[];
  pages: string[];
  cta: string;
  socialLinks: {
    instagram: string;
    whatsapp: string;
    facebook: string;
  };
};

export default function Home() {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editedResult, setEditedResult] = useState<AIResponse | null>(null);

  const sendMessage = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setEditedResult(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setResult(data);
      setEditedResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    if (!editedResult) return;
    setEditedResult({ ...editedResult, [field]: value });
  };

  const updateService = (index: number, value: string) => {
    if (!editedResult) return;
    const newServices = [...editedResult.services];
    newServices[index] = value;
    setEditedResult({ ...editedResult, services: newServices });
  };

  const updateSocial = (platform: string, value: string) => {
    if (!editedResult) return;
    setEditedResult({
      ...editedResult,
      socialLinks: { ...editedResult.socialLinks, [platform]: value },
    });
  };

  const pageRoutes: Record<string, string> = {
    'Home': '/',
    'About Us': '/about',
    'About': '/about',
    'Services': '/services',
    'Contact': '/contact',
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">

      <Navbar />

      {/* HERO */}
      <section className="text-center px-6 pt-24 pb-16">
        <div className="inline-block px-4 py-2 rounded-full border border-blue-500/20 mb-6">
          AI Website & App Builder
        </div>
        <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6">
          Build your business <br />
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            with AI
          </span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-10">
          Nexiora automatically creates websites, dashboards and digital business systems in minutes.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="bg-blue-600 hover:bg-blue-500 px-8 py-4 rounded-full font-semibold">
            Start Building
          </button>
          <button className="border border-white/10 px-8 py-4 rounded-full">
            Watch Demo
          </button>
        </div>
      </section>

      {/* GENERATOR */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur">
          <h2 className="text-3xl font-bold mb-4 text-center">Try Nexiora AI</h2>
          <p className="text-slate-400 mb-6 text-center">
            Describe your business idea and let AI generate your business instantly.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Example: Build a modern Toyota spare parts website..."
            className="w-full h-40 bg-black/30 border border-white/10 focus:border-blue-500 rounded-2xl p-4 text-white placeholder-slate-500 resize-none outline-none"
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            className="w-full mt-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-4 rounded-2xl font-semibold text-lg transition"
          >
            {loading ? 'Generating with AI...' : 'Generate with AI ✨'}
          </button>

          {error && (
            <div className="mt-5 bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl p-4">
              {error}
            </div>
          )}

          {editedResult && (
            <div className="mt-8 bg-black/30 border border-white/10 rounded-2xl p-8">

              {/* Badge type */}
              <div className="mb-6">
                <span className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full uppercase">
                  {editedResult.type}
                </span>
              </div>

              {/* Nom éditable */}
              <div className="mb-2">
                <label className="text-xs text-slate-500 uppercase mb-1 block">Nom du business</label>
                <input
                  value={editedResult.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="text-4xl font-black text-blue-400 bg-transparent border-b-2 border-blue-400/30 focus:border-blue-400 outline-none w-full pb-1"
                />
              </div>

              {/* Slogan éditable */}
              <div className="mb-6">
                <label className="text-xs text-slate-500 uppercase mb-1 block">Slogan</label>
                <input
                  value={editedResult.slogan}
                  onChange={(e) => updateField('slogan', e.target.value)}
                  className="text-slate-300 text-xl bg-transparent border-b border-white/20 focus:border-white/50 outline-none w-full pb-1"
                />
              </div>

              {/* Pages cliquables */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 text-white">📄 Pages</h4>
                <div className="flex flex-wrap gap-2">
                  {editedResult.pages.map((page, i) => (
                    <Link
                      key={i}
                      href={pageRoutes[page] || '/'}
                      className="bg-white/10 border border-white/20 px-4 py-2 rounded-full text-sm hover:bg-blue-500/20 transition"
                    >
                      {page}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Services éditables */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 text-white">⚡ Services</h4>
                <div className="grid gap-3">
                  {editedResult.services.map((service, i) => (
                    <input
                      key={i}
                      value={service}
                      onChange={(e) => updateService(i, e.target.value)}
                      className="bg-white/5 border border-white/10 focus:border-blue-500 rounded-xl px-4 py-3 text-white outline-none w-full"
                    />
                  ))}
                </div>
              </div>

              {/* Réseaux Sociaux éditables */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 text-white">🔗 Réseaux Sociaux</h4>
                <div className="grid gap-3">
                  <input
                    value={editedResult.socialLinks.instagram}
                    onChange={(e) => updateSocial('instagram', e.target.value)}
                    placeholder="Instagram URL"
                    className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-500 w-full"
                  />
                  <input
                    value={editedResult.socialLinks.whatsapp}
                    onChange={(e) => updateSocial('whatsapp', e.target.value)}
                    placeholder="WhatsApp URL"
                    className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-500 w-full"
                  />
                  <input
                    value={editedResult.socialLinks.facebook}
                    onChange={(e) => updateSocial('facebook', e.target.value)}
                    placeholder="Facebook URL"
                    className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-500 w-full"
                  />
                </div>
              </div>

              {/* CTA éditable */}
              <div className="mb-4">
                <label className="text-xs text-slate-500 uppercase mb-1 block">Bouton CTA</label>
                <input
                  value={editedResult.cta}
                  onChange={(e) => updateField('cta', e.target.value)}
                  className="w-full bg-black/30 border border-white/10 focus:border-blue-500 rounded-xl px-4 py-3 text-white outline-none"
                />
              </div>

              <button className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-semibold text-lg transition">
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