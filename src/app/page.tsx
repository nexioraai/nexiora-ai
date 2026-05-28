'use client';

import { useState } from 'react';

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

  const sendMessage = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">

      {/* NAVBAR */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="text-3xl font-black text-blue-400">NX</div>
        <div className="flex items-center gap-6">
          <a href="#" className="text-slate-300 hover:text-white">Features</a>
          <a href="#" className="text-slate-300 hover:text-white">Pricing</a>
          <a href="#" className="text-slate-300 hover:text-white">Docs</a>
          <button className="bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-full">Login</button>
        </div>
      </nav>

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

          {result && (
            <div className="mt-8 bg-black/30 border border-white/10 rounded-2xl p-8">
              
              {/* Business Header */}
              <div className="mb-6">
                <span className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full uppercase">
                  {result.type}
                </span>
                <h3 className="text-4xl font-black text-blue-400 mt-3 mb-2">{result.name}</h3>
                <p className="text-slate-300 text-xl">{result.slogan}</p>
              </div>

              {/* Pages */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 text-white">📄 Pages</h4>
                <div className="flex flex-wrap gap-2">
                  {result.pages.map((page, i) => (
                    <span key={i} className="bg-white/10 border border-white/20 px-4 py-2 rounded-full text-sm cursor-pointer hover:bg-blue-500/20 transition">
                      {page}
                    </span>
                  ))}
                </div>
              </div>

              {/* Services */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 text-white">⚡ Services</h4>
                <div className="grid gap-3">
                  {result.services.map((service, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                      ✦ {service}
                    </div>
                  ))}
                </div>
              </div>

              {/* Social Links */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 text-white">🔗 Réseaux Sociaux</h4>
                <div className="grid gap-3">
                  <input
                    placeholder="Instagram URL"
                    defaultValue={result.socialLinks.instagram}
                    className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-500 w-full"
                  />
                  <input
                    placeholder="WhatsApp URL"
                    defaultValue={result.socialLinks.whatsapp}
                    className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-500 w-full"
                  />
                  <input
                    placeholder="Facebook URL"
                    defaultValue={result.socialLinks.facebook}
                    className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-500 w-full"
                  />
                </div>
              </div>

              {/* CTA */}
              <button className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-semibold text-lg transition">
                {result.cta}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-8 text-center text-slate-500">
        © 2026 Nexiora AI. All rights reserved.
      </footer>
    </main>
  );
}