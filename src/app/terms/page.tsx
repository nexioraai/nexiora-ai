'use client';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useTranslation } from '@/lib/translations';

const LAST_UPDATED = '2 août 2026';

const CONTENT = {
  fr: {
    title: "Conditions d'utilisation",
    updated: `Dernière mise à jour : ${LAST_UPDATED}`,
    intro:
      "Les présentes conditions d'utilisation (les « Conditions ») régissent votre utilisation de Deribfy, un service exploité par Dougma IA Technologies (Montréal, Québec, Canada), ci-après « Deribfy », « nous » ou « notre ». En créant un compte ou en utilisant Deribfy, vous acceptez ces Conditions. Si vous ne les acceptez pas, vous ne pouvez pas utiliser le service.",
    sections: [
      {
        h: '1. Description du service',
        p: [
          "Deribfy est un outil logiciel qui permet aux utilisateurs (les « marchands ») de générer et d'exploiter automatiquement des boutiques en ligne. Deribfy fournit la technologie : génération de site, hébergement, connexion à des fournisseurs et traitement technique des paiements. Deribfy n'est pas un vendeur, ne possède pas les produits offerts par les marchands et n'est pas partie aux contrats de vente conclus entre un marchand et ses clients.",
        ],
      },
      {
        h: '2. Comptes',
        p: [
          "Pour utiliser Deribfy, vous devez créer un compte et fournir des renseignements exacts. Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée sous votre compte. Vous devez avoir l'âge de la majorité dans votre province ou pays et la capacité juridique de conclure un contrat.",
        ],
      },
      {
        h: '3. Responsabilités du marchand',
        p: [
          "En tant que marchand, vous êtes seul responsable de :",
          "• Le contenu de votre boutique (produits, descriptions, images, prix que vous fixez);\n• La légalité de ce que vous vendez (aucun produit illégal, contrefait ou interdit);\n• Le respect de vos obligations fiscales (taxes, TPS/TVQ, déclarations);\n• Le service à vos clients (questions, litiges, retours et remboursements côté relation client);\n• Le respect des lois applicables à votre activité, y compris vos propres mentions légales et votre propre politique de confidentialité envers vos clients acheteurs.",
          "Deribfy fournit l'outil, mais la boutique et les ventes sont les vôtres. Vous nous dégagez de toute responsabilité liée à vos produits, à vos ventes et à vos relations avec vos clients.",
        ],
      },
      {
        h: '4. Rôle de Deribfy dans les paiements',
        p: [
          "Pour les boutiques en mode dropshipping automatisé, les paiements des clients sont traités par notre prestataire Stripe. Deribfy facilite techniquement la transaction et prélève une commission (actuellement 6 %) sur chaque vente, ainsi que les frais liés à l'exécution de la commande auprès du fournisseur. Deribfy n'agit qu'à titre de facilitateur technique du paiement.",
          "Deribfy ne garantit pas les produits fournis par les fournisseurs tiers (notamment leur qualité, leur disponibilité ou leurs délais de livraison). Les fournisseurs disponibles sur la plateforme sont sélectionnés par Deribfy, mais le choix des produits et de leurs prix appartient au marchand. Tout litige portant sur un produit relève de la relation entre le marchand et son client.",
        ],
      },
      {
        h: '5. Abonnement et facturation',
        p: [
          "L'accès à certaines fonctionnalités de Deribfy est offert par abonnement. Les frais, la fréquence de facturation et les modalités sont indiqués au moment de la souscription. Sauf indication contraire, les abonnements se renouvellent automatiquement. Vous pouvez annuler votre abonnement à tout moment; l'annulation prend effet à la fin de la période de facturation en cours. Les montants déjà payés ne sont généralement pas remboursables, sauf disposition légale contraire.",
        ],
      },
      {
        h: '6. Utilisation acceptable',
        p: [
          "Vous acceptez de ne pas utiliser Deribfy pour :",
          "• Vendre des produits ou services illégaux, contrefaits ou dangereux;\n• Enfreindre les droits de propriété intellectuelle d'autrui;\n• Diffuser des contenus frauduleux, trompeurs, haineux ou nuisibles;\n• Tenter de compromettre la sécurité ou le bon fonctionnement de la plateforme;\n• Contourner les mécanismes de paiement ou de commission.",
          "Nous nous réservons le droit de suspendre ou de fermer tout compte qui enfreint ces règles.",
        ],
      },
      {
        h: '7. Propriété intellectuelle',
        p: [
          "Deribfy et sa technologie (code, design, marque « Deribfy ») demeurent la propriété de Dougma IA Technologies. Le contenu que vous créez pour votre boutique (textes, images, produits) demeure le vôtre. En utilisant Deribfy, vous nous accordez une licence limitée nécessaire à l'hébergement et à l'affichage de votre boutique.",
        ],
      },
      {
        h: '8. Limitation de responsabilité',
        p: [
          "Dans les limites permises par la loi, Deribfy est fourni « tel quel » et « selon disponibilité ». Nous ne garantissons pas que le service sera exempt d'erreurs ou d'interruptions. Deribfy ne peut être tenu responsable des pertes de profits, des pertes de données, ni des dommages indirects découlant de l'utilisation du service, de la relation avec vos clients ou du comportement de fournisseurs tiers. Notre responsabilité totale, le cas échéant, ne dépassera pas les montants que vous nous avez payés au cours des douze derniers mois.",
        ],
      },
      {
        h: '9. Résiliation',
        p: [
          "Vous pouvez fermer votre compte à tout moment. Nous pouvons suspendre ou résilier votre accès si vous enfreignez les présentes Conditions ou la loi. À la résiliation, votre droit d'utiliser le service prend fin; certaines dispositions (paiements dus, limitation de responsabilité, propriété intellectuelle) survivent à la résiliation.",
        ],
      },
      {
        h: '10. Modifications des Conditions',
        p: [
          "Nous pouvons modifier ces Conditions. Toute modification importante sera signalée sur cette page avec une nouvelle date de mise à jour. En continuant d'utiliser Deribfy après une modification, vous acceptez les Conditions révisées.",
        ],
      },
      {
        h: '11. Droit applicable',
        p: [
          "Les présentes Conditions sont régies par les lois de la province de Québec et les lois du Canada qui y sont applicables. Tout litige sera soumis aux tribunaux compétents du district de Montréal, Québec.",
        ],
      },
      {
        h: '12. Nous joindre',
        p: [
          "Pour toute question relative aux présentes Conditions : contact@deribfy.com.",
        ],
      },
    ],
    disclaimer:
      "Avis : Le présent document est fourni à titre informatif et ne constitue pas un avis juridique. Nous recommandons de le faire réviser par un conseiller juridique qualifié avant tout usage commercial.",
  },
  en: {
    title: 'Terms of Service',
    updated: `Last updated: ${LAST_UPDATED}`,
    intro:
      "These Terms of Service (the “Terms”) govern your use of Deribfy, a service operated by Dougma IA Technologies (Montreal, Quebec, Canada), referred to below as “Deribfy,” “we,” or “our.” By creating an account or using Deribfy, you agree to these Terms. If you do not agree, you may not use the service.",
    sections: [
      {
        h: '1. Description of the service',
        p: [
          "Deribfy is a software tool that allows users (“merchants”) to automatically generate and operate online stores. Deribfy provides the technology: site generation, hosting, supplier connections, and technical payment processing. Deribfy is not a seller, does not own the products offered by merchants, and is not a party to the sales contracts between a merchant and their customers.",
        ],
      },
      {
        h: '2. Accounts',
        p: [
          "To use Deribfy, you must create an account and provide accurate information. You are responsible for keeping your credentials confidential and for all activity under your account. You must be of the age of majority in your province or country and legally able to enter into a contract.",
        ],
      },
      {
        h: '3. Merchant responsibilities',
        p: [
          "As a merchant, you are solely responsible for:",
          "• The content of your store (products, descriptions, images, prices you set);\n• The legality of what you sell (no illegal, counterfeit, or prohibited products);\n• Compliance with your tax obligations (sales taxes, GST/QST, filings);\n• Customer service (questions, disputes, returns, and refunds on the customer-relationship side);\n• Compliance with laws applicable to your activity, including your own legal notices and your own privacy policy toward your buyers.",
          "Deribfy provides the tool, but the store and the sales are yours. You release us from any liability related to your products, your sales, and your relationships with your customers.",
        ],
      },
      {
        h: "4. Deribfy's role in payments",
        p: [
          "For automated dropshipping stores, customer payments are processed by our provider Stripe. Deribfy technically facilitates the transaction and charges a commission (currently 6%) on each sale, along with the costs related to fulfilling the order with the supplier. Deribfy acts only as a technical payment facilitator.",
          "Deribfy does not guarantee the products supplied by third-party suppliers (including their quality, availability, or delivery times). The suppliers available on the platform are selected by Deribfy, but the choice of products and their prices belongs to the merchant. Any dispute regarding a product is a matter between the merchant and their customer.",
        ],
      },
      {
        h: '5. Subscription and billing',
        p: [
          "Access to certain Deribfy features is offered by subscription. Fees, billing frequency, and terms are shown at the time of subscription. Unless otherwise stated, subscriptions renew automatically. You may cancel your subscription at any time; cancellation takes effect at the end of the current billing period. Amounts already paid are generally non-refundable, except where required by law.",
        ],
      },
      {
        h: '6. Acceptable use',
        p: [
          "You agree not to use Deribfy to:",
          "• Sell illegal, counterfeit, or dangerous products or services;\n• Infringe the intellectual property rights of others;\n• Distribute fraudulent, misleading, hateful, or harmful content;\n• Attempt to compromise the security or proper functioning of the platform;\n• Circumvent payment or commission mechanisms.",
          "We reserve the right to suspend or close any account that violates these rules.",
        ],
      },
      {
        h: '7. Intellectual property',
        p: [
          "Deribfy and its technology (code, design, the “Deribfy” brand) remain the property of Dougma IA Technologies. The content you create for your store (text, images, products) remains yours. By using Deribfy, you grant us a limited license necessary to host and display your store.",
        ],
      },
      {
        h: '8. Limitation of liability',
        p: [
          "To the extent permitted by law, Deribfy is provided “as is” and “as available.” We do not warrant that the service will be error-free or uninterrupted. Deribfy shall not be liable for loss of profits, loss of data, or indirect damages arising from your use of the service, your relationship with your customers, or the conduct of third-party suppliers. Our total liability, if any, will not exceed the amounts you have paid us in the previous twelve months.",
        ],
      },
      {
        h: '9. Termination',
        p: [
          "You may close your account at any time. We may suspend or terminate your access if you violate these Terms or the law. Upon termination, your right to use the service ends; certain provisions (amounts due, limitation of liability, intellectual property) survive termination.",
        ],
      },
      {
        h: '10. Changes to the Terms',
        p: [
          "We may modify these Terms. Any significant change will be posted on this page with a new update date. By continuing to use Deribfy after a change, you accept the revised Terms.",
        ],
      },
      {
        h: '11. Governing law',
        p: [
          "These Terms are governed by the laws of the Province of Quebec and the applicable laws of Canada. Any dispute will be submitted to the competent courts of the district of Montreal, Quebec.",
        ],
      },
      {
        h: '12. Contact us',
        p: [
          "For any question regarding these Terms: contact@deribfy.com.",
        ],
      },
    ],
    disclaimer:
      "Notice: This document is provided for informational purposes and does not constitute legal advice. We recommend having it reviewed by a qualified legal advisor before any commercial use.",
  },
};

export default function TermsPage() {
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
