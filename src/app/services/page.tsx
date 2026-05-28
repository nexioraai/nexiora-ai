import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function Services() {
  const services = [
    {
      icon: '🌐',
      title: 'AI Website Builder',
      desc: 'Generate complete modern websites powered by AI in minutes.',
      price: 'Free to try',
    },
    {
      icon: '📊',
      title: 'Business Dashboard',
      desc: 'Manage analytics, clients and operations intelligently.',
      price: 'Coming soon',
    },
    {
      icon: '🚀',
      title: 'Instant Deployment',
      desc: 'Deploy globally with cloud infrastructure in seconds.',
      price: 'Coming soon',
    },
    {
      icon: '🎨',
      title: 'Brand Generator',
      desc: 'AI generates your logo, colors and brand identity automatically.',
      price: 'Coming soon',
    },
    {
      icon: '📧',
      title: 'Email Pro',
      desc: 'Professional email with your custom domain.',
      price: 'Coming soon',
    },
    {
      icon: '💳',
      title: 'Payment Integration',
      desc: 'Accept payments online with Stripe integration.',
      price: 'Coming soon',
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      <Navbar />

      <section className="max-w-6xl mx-auto px-6 py-24">
        <h1 className="text-5xl font-black mb-4 text-center">
          Our <span className="text-blue-400">Services</span>
        </h1>
        <p className="text-slate-400 text-xl text-center mb-16 max-w-2xl mx-auto">
          Everything you need to build and grow your digital business.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {services.map((service, i) => (
            <div key={i} className="bg-white/5 border border-white/10 hover:border-blue-500/30 rounded-2xl p-6 transition">
              <div className="text-4xl mb-4">{service.icon}</div>
              <h3 className="text-xl font-bold mb-2">{service.title}</h3>
              <p className="text-slate-400 mb-4 leading-relaxed">{service.desc}</p>
              <span className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full">
                {service.price}
              </span>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}