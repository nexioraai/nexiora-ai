import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function About() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      <Navbar />
      
      <section className="max-w-4xl mx-auto px-6 py-24">
        <h1 className="text-5xl font-black mb-6">
          About <span className="text-blue-400">Nexiora</span>
        </h1>
        <p className="text-slate-400 text-xl leading-relaxed mb-8">
          Nexiora is an AI-powered platform that helps entrepreneurs and businesses 
          build their digital presence instantly. We combine cutting-edge AI with 
          beautiful design to create websites, dashboards, and business systems in minutes.
        </p>
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-4xl mb-4">🚀</div>
            <h3 className="text-xl font-bold mb-2">Our Mission</h3>
            <p className="text-slate-400">Democratize digital business creation for everyone.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-4xl mb-4">🌍</div>
            <h3 className="text-xl font-bold mb-2">Our Vision</h3>
            <p className="text-slate-400">A world where anyone can build a digital business in minutes.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-4xl mb-4">💡</div>
            <h3 className="text-xl font-bold mb-2">Our Values</h3>
            <p className="text-slate-400">Innovation, simplicity, and empowerment.</p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}