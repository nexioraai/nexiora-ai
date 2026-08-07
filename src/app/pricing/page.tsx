'use client';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useTranslation } from '@/lib/translations';

const CONTENT = {
  fr: {
    home: 'Accueil',
    kicker: 'Tarifs',
    title: 'Un abonnement simple, sans surprise.',
    lead: "Choisissez le plan adapté à votre projet. Changez ou annulez à tout moment. Tous les prix sont en dollars canadiens (CAD), par mois.",
    perMonth: '/mois',
    cad: 'CAD',
    popular: 'Le plus complet',
    cta: 'Commencer',
    plans: [
      {
        name: 'Vitrine',
        price: '10',
        tagline: "Présentez votre activité avec un site professionnel généré par IA.",
        featured: false,
        features: [
          'Site vitrine généré par IA',
          'Nom de domaine personnalisé',
          'Site multilingue',
          'Hébergement et sécurité inclus',
          'Optimisation pour le référencement',
        ],
        excluded: ['Vente en ligne'],
      },
      {
        name: 'Boutique',
        price: '15',
        tagline: 'Vendez vos propres produits avec une boutique en ligne complète.',
        featured: false,
        features: [
          'Tout le plan Vitrine',
          'Vente de vos propres produits',
          'Catalogue et panier',
          'Paiements sécurisés (Stripe)',
          'Gestion des commandes et du stock',
        ],
        excluded: [],
      },
      {
        name: 'Dropshipping',
        price: '20',
        tagline: 'Une boutique clé en main, entièrement automatisée par l\u2019IA.',
        featured: true,
        features: [
          'Tout le plan Boutique',
          'Création de boutique clé en main par IA',
          'Fournisseurs intégrés',
          'Traitement des commandes automatisé',
          'Tarification et marges automatiques',
          'Agent IA intégré',
          'Contenu marketing généré par IA',
        ],
        excluded: [],
      },
    ],
    faqH: 'Questions fréquentes',
    faq: [
      { q: 'Puis-je changer de plan plus tard ?', a: 'Oui. Vous pouvez passer à un plan supérieur ou inférieur à tout moment depuis votre espace.' },
      { q: 'Puis-je annuler ?', a: 'Oui, à tout moment, sans engagement. Votre accès reste actif jusqu\u2019à la fin de la période payée.' },
      { q: 'Le nom de domaine est-il inclus ?', a: 'Un domaine personnalisé peut être connecté à votre site sur tous les plans.' },
    ],
  },
  en: {
    home: 'Home',
    kicker: 'Pricing',
    title: 'Simple subscriptions, no surprises.',
    lead: 'Choose the plan that fits your project. Upgrade, downgrade or cancel anytime. All prices are in Canadian dollars (CAD), per month.',
    perMonth: '/mo',
    cad: 'CAD',
    popular: 'Most complete',
    cta: 'Get started',
    plans: [
      {
        name: 'Showcase',
        price: '10',
        tagline: 'Present your business with a professional AI-generated website.',
        featured: false,
        features: [
          'AI-generated showcase website',
          'Custom domain name',
          'Multilingual website',
          'Hosting and security included',
          'Search engine optimization',
        ],
        excluded: ['Online selling'],
      },
      {
        name: 'Store',
        price: '15',
        tagline: 'Sell your own products with a full online store.',
        featured: false,
        features: [
          'Everything in Showcase',
          'Sell your own products',
          'Catalog and cart',
          'Secure payments (Stripe)',
          'Order and inventory management',
        ],
        excluded: [],
      },
      {
        name: 'Dropshipping',
        price: '20',
        tagline: 'A turnkey store, fully automated by AI.',
        featured: true,
        features: [
          'Everything in Store',
          'AI-built turnkey store',
          'Integrated suppliers',
          'Automated order fulfillment',
          'Automatic pricing and margins',
          'Built-in AI agent',
          'AI-generated marketing content',
        ],
        excluded: [],
      },
    ],
    faqH: 'Frequently asked questions',
    faq: [
      { q: 'Can I change plans later?', a: 'Yes. You can upgrade or downgrade at any time from your workspace.' },
      { q: 'Can I cancel?', a: 'Yes, anytime, with no commitment. Your access stays active until the end of the paid period.' },
      { q: 'Is the domain name included?', a: 'A custom domain can be connected to your site on all plans.' },
    ],
  },
};

export default function PricingPage() {
  const { lang } = useTranslation();
  const c = CONTENT[lang === 'en' ? 'en' : 'fr'];

  return (
    <div className="min-h-screen nexiora-bg text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-white/50 hover:text-white transition">
          ← {c.home}
        </Link>

        <section className="mt-8 mb-14 text-center">
          <p className="text-sm uppercase tracking-widest" style={{ color: '#FA5D1E' }}>{c.kicker}</p>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold">{c.title}</h1>
          <p className="mt-5 text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">{c.lead}</p>
        </section>

        <section className="grid md:grid-cols-3 gap-6 mb-20">
          {c.plans.map((plan) => (
            <div
              key={plan.name}
              className="rounded-2xl border p-8 flex flex-col relative"
              style={
                plan.featured
                  ? { borderColor: '#FA5D1E', background: '#FA5D1E0D' }
                  : { borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }
              }
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-4 py-1 rounded-full text-white" style={{ background: '#FA5D1E' }}>
                  {c.popular}
                </span>
              )}
              <h2 className="text-xl font-bold">{plan.name}</h2>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-4xl font-bold">${plan.price}</span>
                <span className="text-white/50 mb-1">{c.cad}{c.perMonth}</span>
              </div>
              <p className="mt-4 text-sm text-white/70 leading-relaxed">{plan.tagline}</p>

              <ul className="mt-6 space-y-3 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/80">
                    <span style={{ color: '#FA5D1E' }} className="mt-0.5">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
                {plan.excluded.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/40">
                    <span className="mt-0.5">✗</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className="mt-8 rounded-full px-6 py-3 font-semibold text-center transition hover:opacity-90"
                style={plan.featured ? { background: '#FA5D1E', color: '#fff' } : { background: 'rgba(255,255,255,0.1)', color: '#fff' }}
              >
                {c.cta}
              </Link>
            </div>
          ))}
        </section>

        <section className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-center">{c.faqH}</h2>
          <div className="space-y-4">
            {c.faq.map((item) => (
              <div key={item.q} className="rounded-xl border border-white/10 p-6 bg-white/5">
                <h3 className="font-semibold mb-2">{item.q}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
