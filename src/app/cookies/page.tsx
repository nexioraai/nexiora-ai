'use client';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useTranslation } from '@/lib/translations';

const LAST_UPDATED = '2 août 2026';

const CONTENT = {
  fr: {
    title: 'Politique relative aux témoins',
    updated: `Dernière mise à jour : ${LAST_UPDATED}`,
    intro:
      "La présente politique explique ce que sont les témoins (« cookies »), lesquels Woorri utilise, à quelles fins et comment vous pouvez les gérer. Woorri est un service exploité par Dougma IA Technologies (Montréal, Québec, Canada). Conformément à la Loi 25 du Québec, nous demandons votre consentement avant de déposer les témoins qui ne sont pas strictement nécessaires au fonctionnement du service.",
    sections: [
      {
        h: "1. Qu'est-ce qu'un témoin",
        p: [
          "Un témoin est un petit fichier texte déposé dans votre navigateur lorsque vous visitez un site. Il permet notamment de vous garder connecté, de mémoriser vos préférences et de comprendre l'utilisation du service.",
        ],
      },
      {
        h: '2. Témoins que nous utilisons',
        p: [
          "Témoins strictement nécessaires : indispensables au fonctionnement de Woorri. Ils permettent notamment de vous authentifier et de maintenir votre session ouverte. Sans eux, le service ne peut pas fonctionner. Ces témoins ne nécessitent pas votre consentement.",
          "Témoins de préférences : mémorisent vos choix, comme la langue d'affichage, afin d'améliorer votre expérience.",
          "Témoins de mesure d'audience : nous utilisons des outils d'analyse (notamment Vercel Analytics et Speed Insights) pour comprendre de façon agrégée comment la plateforme est utilisée et en améliorer la performance. Ces témoins ne sont déposés qu'avec votre consentement.",
        ],
      },
      {
        h: '3. Votre consentement',
        p: [
          "Lors de votre première visite, une bannière vous permet d'accepter ou de refuser les témoins non essentiels. Les témoins strictement nécessaires restent actifs car ils sont indispensables au service. Vous pouvez modifier votre choix à tout moment en effaçant les témoins de votre navigateur ou en nous contactant.",
        ],
      },
      {
        h: '4. Gérer les témoins dans votre navigateur',
        p: [
          "La plupart des navigateurs vous permettent de refuser ou de supprimer les témoins dans leurs paramètres. Notez que la désactivation de certains témoins peut affecter le bon fonctionnement de Woorri.",
        ],
      },
      {
        h: '5. Modifications',
        p: [
          "Nous pouvons mettre à jour la présente politique. Toute modification importante sera signalée sur cette page avec une nouvelle date de mise à jour.",
        ],
      },
      {
        h: '6. Nous joindre',
        p: [
          "Pour toute question relative aux témoins : contact@woorri.com.",
        ],
      },
    ],
    disclaimer:
      "Avis : Le présent document est fourni à titre informatif et ne constitue pas un avis juridique. Nous recommandons de le faire réviser par un conseiller juridique qualifié avant tout usage commercial.",
  },
  en: {
    title: 'Cookie Policy',
    updated: `Last updated: ${LAST_UPDATED}`,
    intro:
      "This policy explains what cookies are, which ones Woorri uses, for what purposes, and how you can manage them. Woorri is a service operated by Dougma IA Technologies (Montreal, Quebec, Canada). In accordance with Quebec's Law 25, we ask for your consent before placing cookies that are not strictly necessary for the service to function.",
    sections: [
      {
        h: '1. What is a cookie',
        p: [
          "A cookie is a small text file placed in your browser when you visit a site. It can, among other things, keep you logged in, remember your preferences, and help us understand how the service is used.",
        ],
      },
      {
        h: '2. Cookies we use',
        p: [
          "Strictly necessary cookies: essential for Woorri to function. They allow us to authenticate you and keep your session open. Without them, the service cannot work. These cookies do not require your consent.",
          "Preference cookies: remember your choices, such as your display language, to improve your experience.",
          "Analytics cookies: we use analytics tools (including Vercel Analytics and Speed Insights) to understand, in aggregate, how the platform is used and to improve its performance. These cookies are only placed with your consent.",
        ],
      },
      {
        h: '3. Your consent',
        p: [
          "On your first visit, a banner lets you accept or decline non-essential cookies. Strictly necessary cookies remain active because they are essential to the service. You can change your choice at any time by clearing the cookies in your browser or by contacting us.",
        ],
      },
      {
        h: '4. Managing cookies in your browser',
        p: [
          "Most browsers let you refuse or delete cookies in their settings. Note that disabling certain cookies may affect how Woorri works.",
        ],
      },
      {
        h: '5. Changes',
        p: [
          "We may update this policy. Any significant change will be posted on this page with a new update date.",
        ],
      },
      {
        h: '6. Contact us',
        p: [
          "For any question regarding cookies: contact@woorri.com.",
        ],
      },
    ],
    disclaimer:
      "Notice: This document is provided for informational purposes and does not constitute legal advice. We recommend having it reviewed by a qualified legal advisor before any commercial use.",
  },
};

export default function CookiesPage() {
  const { lang } = useTranslation();
  const c = CONTENT[lang === 'en' ? 'en' : 'fr'];

  return (
    <main className="nexiora-bg min-h-screen text-white">
      <Navbar />
      <section className="max-w-3xl mx-auto px-6 pt-12 pb-24">
        <Link
          href="/"
          className="self-start px-5 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-200 mb-6 inline-block whitespace-nowrap"
        >
          ← {lang === 'en' ? 'Home' : 'Accueil'}
        </Link>

        <div className="glass rounded-3xl p-6 md:p-10">
          <h1 className="text-3xl md:text-4xl font-black mb-2">{c.title}</h1>
          <p className="text-sm text-slate-400 mb-8">{c.updated}</p>

          <p className="text-slate-300 leading-relaxed mb-8 whitespace-pre-line">{c.intro}</p>

          <div className="space-y-8">
            {c.sections.map((s, i) => (
              <div key={i}>
                <h2 className="text-lg font-bold text-white mb-3">{s.h}</h2>
                {s.p.map((para, j) => (
                  <p key={j} className="text-slate-300 leading-relaxed mb-3 whitespace-pre-line">
                    {para}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-10 pt-6 border-t border-white/10">
            <p className="text-xs text-slate-500 italic whitespace-pre-line">{c.disclaimer}</p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
