import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: site } = await supabase
    .from('sites')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!site) return notFound();

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white">
      <Navbar />
      <section className="text-center px-6 pt-24 pb-16">
        <h1 className="text-6xl font-black mt-6 mb-4 text-blue-400">{site.name}</h1>
        <p className="text-slate-400 text-xl">{site.slogan}</p>
      </section>
      <Footer />
    </main>
  );
}
