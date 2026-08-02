'use client';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useTranslation } from '@/lib/translations';

const LAST_UPDATED = '2 août 2026';

const CONTENT = {
  fr: {
    title: 'Politique de confidentialité',
    updated: `Dernière mise à jour : ${LAST_UPDATED}`,
    intro:
      "La présente politique explique quels renseignements personnels Woorri recueille, pourquoi, comment ils sont utilisés et protégés, et quels sont vos droits. Woorri est un service exploité par Dougma IA Technologies (Montréal, Québec, Canada), ci-après « Woorri », « nous » ou « notre ». Nous nous conformons à la Loi 25 du Québec (Loi modernisant des dispositions législatives en matière de protection des renseignements personnels) ainsi qu'à la loi fédérale canadienne (LPRPDE / PIPEDA).",
    sections: [
      {
        h: '1. Qui est responsable de vos renseignements',
        p: [
          "Woorri est un service exploité par Dougma IA Technologies, une entreprise enregistrée au Québec (Canada). Toute question relative à la protection des renseignements personnels peut être adressée à notre responsable de la protection des renseignements personnels :",
          "Responsable de la protection des renseignements personnels\nDougma IA Technologies (exploitant « Woorri »)\nMontréal, Québec, Canada\nCourriel : contact@nexiora.ca",
        ],
      },
      {
        h: '2. Renseignements que nous recueillons',
        p: [
          "Nous recueillons uniquement les renseignements nécessaires à la fourniture de nos services :",
          "• Renseignements de compte : votre prénom, votre adresse courriel et votre mot de passe (chiffré) lorsque vous créez un compte.\n• Renseignements de facturation : les données nécessaires au traitement de votre abonnement, gérées par notre prestataire de paiement Stripe. Woorri ne stocke pas vos numéros de carte de crédit.\n• Renseignements sur vos boutiques : le contenu que vous créez (nom de boutique, produits, textes, images).\n• Données d'utilisation : informations techniques sur votre utilisation de la plateforme (pages visitées, actions effectuées), afin d'améliorer le service.",
        ],
      },
      {
        h: '3. Pourquoi nous utilisons vos renseignements',
        p: [
          "Nous utilisons vos renseignements uniquement aux fins suivantes :",
          "• Créer et gérer votre compte;\n• Générer et héberger vos boutiques en ligne;\n• Traiter votre abonnement et vos paiements;\n• Vous envoyer des communications liées au service (confirmations, avis importants);\n• Améliorer, sécuriser et maintenir la plateforme;\n• Respecter nos obligations légales.",
          "Nous ne vendons jamais vos renseignements personnels à des tiers.",
        ],
      },
      {
        h: '4. Consentement',
        p: [
          "En créant un compte et en utilisant Woorri, vous consentez à la collecte et à l'utilisation de vos renseignements telles que décrites dans la présente politique. Vous pouvez retirer votre consentement à tout moment en fermant votre compte ou en nous contactant, sous réserve des obligations légales et contractuelles qui pourraient subsister.",
        ],
      },
      {
        h: '5. Partage et transferts hors du Québec',
        p: [
          "Pour fonctionner, Woorri fait appel à des prestataires de services situés à l'extérieur du Québec et du Canada. Ces prestataires n'ont accès qu'aux renseignements nécessaires à l'exécution de leurs fonctions et sont tenus de les protéger :",
          "• Stripe (paiements) — États-Unis;\n• Vercel (hébergement) — États-Unis;\n• Supabase (base de données) — hébergement pouvant être situé hors du Canada;\n• Fournisseurs d'exécution des commandes (CJ Dropshipping, Printful, Printify) — pour les boutiques concernées;\n• Anthropic (traitement par intelligence artificielle) — États-Unis.",
          "Conformément à la Loi 25, nous avons évalué que ces transferts bénéficient d'une protection adéquate. En utilisant Woorri, vous reconnaissez que vos renseignements peuvent être traités à l'extérieur du Québec.",
        ],
      },
      {
        h: '6. Responsabilité des marchands envers leurs clients',
        p: [
          "Woorri est un outil qui permet aux marchands de créer et d'exploiter leurs propres boutiques en ligne. Lorsqu'un marchand utilise Woorri pour vendre à ses propres clients, c'est le marchand — et non Woorri — qui est responsable des renseignements personnels de ses clients acheteurs. Le marchand agit comme responsable du traitement de ces données; Woorri n'agit qu'à titre de fournisseur technique. Chaque marchand est responsable de sa propre conformité légale envers ses clients, y compris sa propre politique de confidentialité.",
        ],
      },
      {
        h: '7. Conservation et destruction',
        p: [
          "Nous conservons vos renseignements personnels aussi longtemps que nécessaire pour fournir nos services et respecter nos obligations légales. Lorsque leur finalité est atteinte, nous les détruisons ou les anonymisons de façon sécuritaire.",
        ],
      },
      {
        h: '8. Sécurité',
        p: [
          "Nous mettons en œuvre des mesures de sécurité raisonnables (chiffrement, contrôle d'accès, hébergement sécurisé) pour protéger vos renseignements contre la perte, le vol et l'accès non autorisé. En cas d'incident de confidentialité présentant un risque de préjudice sérieux, nous vous en aviserons et informerons les autorités compétentes conformément à la loi.",
        ],
      },
      {
        h: '9. Vos droits',
        p: [
          "Conformément à la Loi 25 et à la LPRPDE, vous avez le droit de :",
          "• Accéder aux renseignements personnels que nous détenons à votre sujet;\n• Demander leur rectification s'ils sont inexacts;\n• Demander leur suppression, sous réserve des obligations légales;\n• Retirer votre consentement;\n• Déposer une plainte auprès de nous ou de la Commission d'accès à l'information du Québec (CAI).",
          "Pour exercer ces droits, contactez-nous à contact@nexiora.ca. Nous répondrons dans les délais prévus par la loi.",
        ],
      },
      {
        h: '10. Témoins (cookies)',
        p: [
          "Woorri utilise des témoins et technologies similaires. Pour en savoir plus, consultez notre Politique relative aux témoins.",
        ],
      },
      {
        h: '11. Modifications',
        p: [
          "Nous pouvons mettre à jour la présente politique. Toute modification importante sera signalée sur cette page avec une nouvelle date de mise à jour.",
        ],
      },
    ],
    disclaimer:
      "Avis : Le présent document est fourni à titre informatif et ne constitue pas un avis juridique. Nous recommandons de le faire réviser par un conseiller juridique qualifié avant tout usage commercial.",
  },
  en: {
    title: 'Privacy Policy',
    updated: `Last updated: ${LAST_UPDATED}`,
    intro:
      "This policy explains what personal information Woorri collects, why, how it is used and protected, and what your rights are. Woorri is a service operated by Dougma IA Technologies (Montreal, Quebec, Canada), referred to below as “Woorri,” “we,” or “our.” We comply with Quebec's Law 25 (Act to modernize legislative provisions as regards the protection of personal information) and with Canadian federal law (PIPEDA).",
    sections: [
      {
        h: '1. Who is responsible for your information',
        p: [
          "Woorri is a service operated by Dougma IA Technologies, a company registered in Quebec, Canada. Any question regarding the protection of personal information may be directed to our privacy officer:",
          "Privacy Officer\nDougma IA Technologies (operating as “Woorri”)\nMontreal, Quebec, Canada\nEmail: contact@nexiora.ca",
        ],
      },
      {
        h: '2. Information we collect',
        p: [
          "We collect only the information necessary to provide our services:",
          "• Account information: your first name, email address, and password (encrypted) when you create an account.\n• Billing information: data needed to process your subscription, handled by our payment provider Stripe. Woorri does not store your credit card numbers.\n• Store information: the content you create (store name, products, text, images).\n• Usage data: technical information about your use of the platform (pages visited, actions taken), to improve the service.",
        ],
      },
      {
        h: '3. Why we use your information',
        p: [
          "We use your information only for the following purposes:",
          "• To create and manage your account;\n• To generate and host your online stores;\n• To process your subscription and payments;\n• To send you service-related communications (confirmations, important notices);\n• To improve, secure, and maintain the platform;\n• To comply with our legal obligations.",
          "We never sell your personal information to third parties.",
        ],
      },
      {
        h: '4. Consent',
        p: [
          "By creating an account and using Woorri, you consent to the collection and use of your information as described in this policy. You may withdraw your consent at any time by closing your account or contacting us, subject to any legal and contractual obligations that may remain.",
        ],
      },
      {
        h: '5. Sharing and transfers outside Quebec',
        p: [
          "To operate, Woorri relies on service providers located outside Quebec and Canada. These providers only have access to the information necessary to perform their functions and are required to protect it:",
          "• Stripe (payments) — United States;\n• Vercel (hosting) — United States;\n• Supabase (database) — hosting that may be located outside Canada;\n• Order fulfillment providers (CJ Dropshipping, Printful, Printify) — for the relevant stores;\n• Anthropic (artificial intelligence processing) — United States.",
          "In accordance with Law 25, we have assessed that these transfers benefit from adequate protection. By using Woorri, you acknowledge that your information may be processed outside Quebec.",
        ],
      },
      {
        h: '6. Merchant responsibility toward their customers',
        p: [
          "Woorri is a tool that allows merchants to create and operate their own online stores. When a merchant uses Woorri to sell to their own customers, it is the merchant — not Woorri — who is responsible for the personal information of their buyers. The merchant acts as the controller of that data; Woorri acts only as a technical provider. Each merchant is responsible for their own legal compliance toward their customers, including their own privacy policy.",
        ],
      },
      {
        h: '7. Retention and destruction',
        p: [
          "We retain your personal information for as long as necessary to provide our services and meet our legal obligations. Once its purpose is fulfilled, we securely destroy or anonymize it.",
        ],
      },
      {
        h: '8. Security',
        p: [
          "We implement reasonable security measures (encryption, access control, secure hosting) to protect your information against loss, theft, and unauthorized access. In the event of a confidentiality incident posing a risk of serious harm, we will notify you and the relevant authorities as required by law.",
        ],
      },
      {
        h: '9. Your rights',
        p: [
          "In accordance with Law 25 and PIPEDA, you have the right to:",
          "• Access the personal information we hold about you;\n• Request its correction if it is inaccurate;\n• Request its deletion, subject to legal obligations;\n• Withdraw your consent;\n• File a complaint with us or with the Commission d'accès à l'information du Québec (CAI).",
          "To exercise these rights, contact us at contact@nexiora.ca. We will respond within the timeframes required by law.",
        ],
      },
      {
        h: '10. Cookies',
        p: [
          "Woorri uses cookies and similar technologies. To learn more, see our Cookie Policy.",
        ],
      },
      {
        h: '11. Changes',
        p: [
          "We may update this policy. Any significant change will be posted on this page with a new update date.",
        ],
      },
    ],
    disclaimer:
      "Notice: This document is provided for informational purposes and does not constitute legal advice. We recommend having it reviewed by a qualified legal advisor before any commercial use.",
  },
};

export default function PrivacyPage() {
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
