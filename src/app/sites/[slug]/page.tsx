import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default async function SitePage({ params }: { params: { slug: string } }) {
  const { data: site } = await supabase
    .from('sites')
    .select('*')
    .eq('slug', params.slug)
    .single();

  if (!site) return notFound();

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white">
      <Navbar />
      <section className="text-center px-6 pt-24 pb-16">
        <span className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full">
          {site.type}
        </span>
        <h1 className="text-6xl font-black mt-6 mb-4 text-blue-400">{site.name}</h1>
        <p className="text-slate-400 text-xl">{site.slogan}</p>
        <button className="mt-8 bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-xl font-semibold transition">
          {site.cta}
        </button>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold mb-6">Nos Services</h2>
        <div className="grid gap-4">
          {site.services?.map((service: string, i: number) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
              {service}
            </div>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}