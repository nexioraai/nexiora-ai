'use client';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useTranslation } from '@/lib/translations';

const CONTENT = {
  fr: {
    home: 'Accueil',
    heroKicker: 'À propos de Woorri',
    heroTitle: 'La plateforme unifiée pour créer, gérer et développer votre présence numérique.',
    heroLead:
      "Woorri est une plateforme SaaS propulsée par l'intelligence artificielle qui réunit, dans une seule interface, les outils dont une entreprise a besoin pour lancer et faire croître son activité en ligne : création de sites, e-commerce, marketing, automatisation, analyse de données et IA conversationnelle.",
    missionH: 'Notre mission',
    missionP:
      "Rendre accessibles à toutes les entreprises — des indépendants aux équipes en croissance — des capacités numériques qui étaient jusqu'ici réservées aux grandes organisations disposant d'équipes techniques dédiées. Woorri supprime la complexité : décrivez votre objectif, la plateforme s'occupe du reste.",
    visionH: 'Notre vision',
    visionP:
      "Un monde où lancer et piloter une entreprise en ligne ne demande ni compétences techniques, ni multiplication d'outils déconnectés. Une seule plateforme, intelligente, qui comprend votre activité et vous aide à décider, créer et vendre.",
    valuesH: 'Nos valeurs',
    values: [
      { h: 'Simplicité', p: "La technologie doit disparaître derrière le résultat. Nous concevons chaque fonctionnalité pour qu'elle soit utilisable sans manuel." },
      { h: 'Transparence', p: "Vos données vous appartiennent. Nous n'affichons que des informations réelles et vérifiables, jamais de chiffres inventés." },
      { h: "Intelligence au service de l'humain", p: "L'IA de Woorri assiste et recommande ; les décisions restent entre vos mains." },
      { h: 'Fiabilité', p: 'Une plateforme sur laquelle vous pouvez compter au quotidien pour faire tourner votre activité.' },
    ],
    capsH: 'Une plateforme, plusieurs capacités',
    capsLead: "Woorri regroupe des outils complémentaires pensés pour fonctionner ensemble :",
    caps: [
      { h: 'Création de sites web', p: 'Générez un site professionnel complet à partir d\u2019une simple description.' },
      { h: 'E-commerce', p: 'Boutiques en ligne, catalogues et gestion des commandes de bout en bout.' },
      { h: 'Marketing par IA', p: 'Tableaux de bord, analyses et recommandations pour piloter votre acquisition.' },
      { h: 'Automatisation', p: 'Déléguez les tâches répétitives et concentrez-vous sur la croissance.' },
      { h: 'Analyse de données', p: 'Des indicateurs clairs et des rapports pour comprendre votre performance.' },
      { h: 'IA conversationnelle', p: 'Un assistant qui connaît votre activité et répond à vos questions.' },
      { h: 'CRM & gestion', p: 'Suivez vos clients, vos ventes et vos opérations au même endroit.' },
      { h: 'Intégrations', p: 'Connectez vos outils et services existants à votre espace Woorri.' },
    ],
    aiH: "L'approche IA de Woorri",
    aiP:
      "L'intelligence artificielle est au cœur de Woorri, mais elle reste un moyen, pas une fin. Elle accélère la création, éclaire vos décisions et automatise ce qui peut l'être — toujours à partir de vos données réelles, et toujours sous votre contrôle. Woorri ne remplace pas votre jugement : il vous donne les moyens de mieux décider, plus vite.",
    companyH: "L'entreprise",
    companyP:
      "Woorri est un produit développé et exploité par Dougma IA Technologies, une entreprise basée à Montréal, au Québec (Canada).",
    contactH: 'Nous contacter',
    contactP: 'Une question, un partenariat, une demande presse ?',
    contactCta: 'Écrivez-nous',
    email: 'contact@woorri.com',
  },
  en: {
    home: 'Home',
    heroKicker: 'About Woorri',
    heroTitle: 'The unified platform to create, manage and grow your digital presence.',
    heroLead:
      'Woorri is an AI-powered SaaS platform that brings together, in a single interface, the tools a business needs to launch and grow online: website creation, e-commerce, marketing, automation, data analytics and conversational AI.',
    missionH: 'Our mission',
    missionP:
      'To make digital capabilities that were once reserved for large organizations with dedicated technical teams accessible to every business — from solo founders to growing teams. Woorri removes the complexity: describe your goal, and the platform handles the rest.',
    visionH: 'Our vision',
    visionP:
      'A world where launching and running an online business requires neither technical skills nor a patchwork of disconnected tools. One intelligent platform that understands your business and helps you decide, create and sell.',
    valuesH: 'Our values',
    values: [
      { h: 'Simplicity', p: 'Technology should disappear behind the result. Every feature is designed to be usable without a manual.' },
      { h: 'Transparency', p: 'Your data belongs to you. We only display real, verifiable information — never invented figures.' },
      { h: 'Intelligence in service of people', p: 'Woorri\u2019s AI assists and recommends; decisions stay in your hands.' },
      { h: 'Reliability', p: 'A platform you can count on every day to run your business.' },
    ],
    capsH: 'One platform, many capabilities',
    capsLead: 'Woorri combines complementary tools designed to work together:',
    caps: [
      { h: 'Website creation', p: 'Generate a complete professional website from a simple description.' },
      { h: 'E-commerce', p: 'Online stores, catalogs and end-to-end order management.' },
      { h: 'AI marketing', p: 'Dashboards, analytics and recommendations to drive your acquisition.' },
      { h: 'Automation', p: 'Delegate repetitive tasks and focus on growth.' },
      { h: 'Data analytics', p: 'Clear metrics and reports to understand your performance.' },
      { h: 'Conversational AI', p: 'An assistant that knows your business and answers your questions.' },
      { h: 'CRM & operations', p: 'Track customers, sales and operations in one place.' },
      { h: 'Integrations', p: 'Connect your existing tools and services to your Woorri workspace.' },
    ],
    aiH: 'Woorri\u2019s approach to AI',
    aiP:
      'Artificial intelligence is at the heart of Woorri, but it remains a means, not an end. It speeds up creation, informs your decisions and automates what can be automated — always from your real data, and always under your control. Woorri doesn\u2019t replace your judgment: it helps you make better decisions, faster.',
    companyH: 'The company',
    companyP:
      'Woorri is a product built and operated by Dougma IA Technologies, a company based in Montreal, Quebec (Canada).',
    contactH: 'Get in touch',
    contactP: 'A question, a partnership, a press inquiry?',
    contactCta: 'Contact us',
    email: 'contact@woorri.com',
  },
};

export default function AboutPage() {
  const { lang } = useTranslation();
  const c = CONTENT[lang === 'en' ? 'en' : 'fr'];

  return (
    <div className="min-h-screen nexiora-bg text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-white/50 hover:text-white transition">
          ← {c.home}
        </Link>

        {/* Hero */}
        <section className="mt-8 mb-20">
          <p className="text-sm uppercase tracking-widest" style={{ color: '#FA5D1E' }}>{c.heroKicker}</p>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold leading-tight max-w-3xl">{c.heroTitle}</h1>
          <p className="mt-6 text-lg text-white/70 max-w-2xl leading-relaxed">{c.heroLead}</p>
        </section>

        {/* Mission / Vision */}
        <section className="grid md:grid-cols-2 gap-8 mb-20">
          <div className="rounded-2xl border border-white/10 p-8 bg-white/5">
            <h2 className="text-2xl font-semibold mb-3">{c.missionH}</h2>
            <p className="text-white/70 leading-relaxed">{c.missionP}</p>
          </div>
          <div className="rounded-2xl border border-white/10 p-8 bg-white/5">
            <h2 className="text-2xl font-semibold mb-3">{c.visionH}</h2>
            <p className="text-white/70 leading-relaxed">{c.visionP}</p>
          </div>
        </section>

        {/* Valeurs */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold mb-8">{c.valuesH}</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {c.values.map((v) => (
              <div key={v.h} className="rounded-xl border border-white/10 p-6 bg-white/5">
                <h3 className="text-lg font-semibold mb-2" style={{ color: '#FA5D1E' }}>{v.h}</h3>
                <p className="text-white/70 leading-relaxed">{v.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Capacités */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold mb-3">{c.capsH}</h2>
          <p className="text-white/70 mb-8 max-w-2xl">{c.capsLead}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {c.caps.map((cap) => (
              <div key={cap.h} className="rounded-xl border border-white/10 p-5 bg-white/5">
                <h3 className="font-semibold mb-2">{cap.h}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{cap.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Approche IA */}
        <section className="mb-20 rounded-2xl border border-white/10 p-10 bg-white/5">
          <h2 className="text-3xl font-bold mb-4">{c.aiH}</h2>
          <p className="text-white/70 leading-relaxed max-w-3xl">{c.aiP}</p>
        </section>

        {/* Entreprise */}
        <section className="mb-20">
          <h2 className="text-2xl font-semibold mb-3">{c.companyH}</h2>
          <p className="text-white/70 leading-relaxed max-w-2xl">{c.companyP}</p>
        </section>

        {/* Contact */}
        <section className="rounded-2xl border p-10 text-center" style={{ borderColor: '#FA5D1E33', background: '#FA5D1E0D' }}>
          <h2 className="text-2xl font-semibold mb-2">{c.contactH}</h2>
          <p className="text-white/70 mb-6">{c.contactP}</p>
          <a href={`mailto:${c.email}`} className="inline-block rounded-full px-8 py-3 font-semibold text-white transition hover:opacity-90" style={{ background: '#FA5D1E' }}>
            {c.contactCta}
          </a>
        </section>
      </main>
      <Footer />
    </div>
  );
}
