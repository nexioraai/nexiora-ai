import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function Contact() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      <Navbar />
      
      <section className="max-w-2xl mx-auto px-6 py-24">
        <h1 className="text-5xl font-black mb-6">
          Contact <span className="text-blue-400">Us</span>
        </h1>
        <p className="text-slate-400 text-xl mb-12">
          Have a question? We'd love to hear from you.
        </p>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
          <div className="grid gap-6">
            <div>
              <label className="text-xs text-slate-500 uppercase mb-2 block">Your Name</label>
              <input
                type="text"
                placeholder="Youssouf"
                className="w-full bg-black/30 border border-white/10 focus:border-blue-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase mb-2 block">Email</label>
              <input
                type="email"
                placeholder="you@nexiora.ca"
                className="w-full bg-black/30 border border-white/10 focus:border-blue-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase mb-2 block">Message</label>
              <textarea
                placeholder="Tell us about your project..."
                rows={5}
                className="w-full bg-black/30 border border-white/10 focus:border-blue-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none resize-none"
              />
            </div>
            <button className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-semibold text-lg transition">
              Send Message 🚀
            </button>
          </div>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-6 text-center">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-3xl mb-3">📧</div>
            <p className="text-slate-400">contact@nexiora.ca</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-3xl mb-3">📍</div>
            <p className="text-slate-400">Montreal, Quebec</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-3xl mb-3">💬</div>
            <p className="text-slate-400">WhatsApp disponible</p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}