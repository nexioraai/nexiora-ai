'use client';

import { useState } from 'react';

type AIResponse = {
  name: string;
  slogan: string;
  services: string[];
  cta: string;
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-[#08142c] to-black text-white font-sans">

      {/* NAVBAR */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-white/10">
        <div className="text-3xl font-black text-blue-400">
          NX
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm">
          <a href="#" className="text-slate-300 hover:text-white transition">
            Features
          </a>

          <a href="#" className="text-slate-300 hover:text-white transition">
            Pricing
          </a>

          <a href="#" className="text-slate-300 hover:text-white transition">
            Docs
          </a>

          <button className="bg-blue-600 hover:bg-blue-500 transition px-5 py-2 rounded-xl font-medium">
            Login
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="text-center px-6 pt-24 pb-16">
        <div className="inline-block px-4 py-2 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-300 text-sm mb-6">
          AI Website & App Builder
        </div>

        <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6">
          Build your business
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            with AI
          </span>
        </h1>

        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
          Nexiora automatically creates websites, dashboards and digital business systems in minutes.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
          <button className="bg-blue-600 hover:bg-blue-500 transition px-8 py-4 rounded-2xl font-semibold text-lg">
            Start Building
          </button>

          <button className="border border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 transition px-8 py-4 rounded-2xl font-semibold text-lg">
            Watch Demo
          </button>
        </div>
      </section>

      {/* PROMPT BUILDER */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">

          <h2 className="text-3xl font-bold mb-4 text-center">
            Try Nexiora AI
          </h2>

          <p className="text-slate-400 mb-6 text-center">
            Describe your business idea and let AI generate your business instantly.
          </p>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Example: Build a modern Toyota spare parts website..."
            className="w-full h-40 bg-black/30 border border-white/10 focus:border-blue-500 focus:outline-none rounded-2xl p-5 text-white placeholder:text-slate-500 resize-none transition"
          />

          <button
            onClick={sendMessage}
            disabled={loading}
            className="w-full mt-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition py-4 rounded-2xl font-semibold text-lg"
          >
            {loading ? 'Generating with AI...' : 'Generate with AI ✨'}
          </button>

          {error && (
            <div className="mt-5 bg-red-500/10 border border-red-500/20 text-red-300 rounded-2xl p-4">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-8 bg-black/30 border border-white/10 rounded-2xl p-8">
              
              <h3 className="text-4xl font-black text-blue-400 mb-3">
                {result.name}
              </h3>

              <p className="text-xl text-slate-300 mb-8">
                {result.slogan}
              </p>

              <div className="mb-8">
                <h4 className="text-lg font-semibold mb-4 text-white">
                  Services
                </h4>

                <div className="grid gap-3">
                  {result.services.map((service, index) => (
                    <div
                      key={index}
                      className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-slate-300"
                    >
                      ✨ {service}
                    </div>
                  ))}
                </div>
              </div>

              <button className="bg-blue-600 hover:bg-blue-500 transition px-8 py-4 rounded-2xl font-semibold text-lg">
                {result.cta}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* FEATURES */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 px-6 pb-24 max-w-7xl mx-auto">
        {[
          {
            title: 'AI Website Builder',
            desc: 'Generate complete modern websites powered by AI.',
          },
          {
            title: 'Business Dashboard',
            desc: 'Manage analytics, clients and operations intelligently.',
          },
          {
            title: 'Instant Deployment',
            desc: 'Deploy globally with cloud infrastructure in seconds.',
          },
        ].map((feature, index) => (
          <div
            key={index}
            className="bg-white/5 border border-white/10 hover:border-blue-500/30 transition rounded-3xl p-8"
          >
            <div className="text-4xl mb-6">
              ✨
            </div>

            <h3 className="text-2xl font-bold mb-4">
              {feature.title}
            </h3>

            <p className="text-slate-400 leading-relaxed">
              {feature.desc}
            </p>
          </div>
        ))}
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-8 text-center text-slate-500 text-sm">
        © 2026 Nexiora AI. All rights reserved.
      </footer>
    </main>
  );
}