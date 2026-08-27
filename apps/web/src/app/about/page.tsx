import type { Metadata } from 'next';
import AboutContent from './AboutContent';
import { jsonLdPlateforme } from '../../../documentation/jsonld';
import JsonLdScript from '../sites/[slug]/themes/JsonLdScript';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.deribfy.com';

const TITLE = 'À propos de Deribfy — Notre mission, vision et approche IA';
const RAW_DESCRIPTION =
  "Deribfy est une plateforme SaaS propulsée par l'intelligence artificielle qui réunit, dans une seule interface, les outils dont une entreprise a besoin pour lancer et faire croître son activité en ligne : création de sites, e-commerce, marketing, automatisation, analyse de données et IA conversationnelle.";
const DESCRIPTION =
  RAW_DESCRIPTION.length > 160 ? RAW_DESCRIPTION.slice(0, 157).trimEnd() + '…' : RAW_DESCRIPTION;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/about`,
    siteName: 'Deribfy',
    type: 'website',
  },
};

// ============================================================
// PAGE D'ENTITE CANONIQUE DE DERIBFY -- SEUL POINT DE MONTAGE DU BALISAGE.
//
// POURQUOI ICI ET NULLE PART AILLEURS. Le depot n'a qu'UN layout
// (`src/app/layout.tsx`) et aucun groupe de routes : ce layout enveloppe
// AUSSI `/sites/[slug]`, vers lequel le proxy reecrit chaque domaine client.
// Un balisage place dans le layout serait donc servi sur le domaine de chaque
// client, y attribuant Deribfy comme entite editrice. La racine `/`, elle,
// est un composant client sans metadonnees serveur : c'est l'entree de
// l'application, pas une page d'entite. `/about` est la seule surface a la
// fois publique, rendue cote serveur, canonique et jamais atteinte par le
// proxy -- et « a propos » EST, par convention, la page d'entite.
//
// L'UNICITE EST VERIFIEE, PAS SEULEMENT INTENTIONNELLE : un test
// d'architecture compte les points de montage dans tout `src/` et echoue s'il
// y en a zero, deux, ou un seul place ailleurs qu'ici.
//
// LES URL POINTENT VERS LA RACINE DU DOMAINE, PAS VERS `/about`.
// `Organization` et `WebSite` designent l'entite et le site ENTIER ; les
// ancrer sur `/about` declarerait que le site de Deribfy commence a `/about`.
// Seule la page qui PORTE le balisage est `/about` -- ce que dit deja
// `alternates.canonical` ci-dessus, et qui n'a pas a etre repete ici.
//
// LA SERIALISATION N'EST PAS REECRITE ICI. `JsonLdScript` est le seul sink
// du depot autorise a passer du JSON a `dangerouslySetInnerHTML` (M1-01), et
// il echappe cinq caracteres -- `<` `>` `&` U+2028 U+2029 -- la ou une
// serialisation ecrite sur place n'en aurait echappe qu'un. La source est un
// manifeste statique, donc sans donnee utilisateur AUJOURD'HUI ; s'appuyer
// sur cette propriete plutot que sur le sink commun aurait fait dependre la
// surete d'une hypothese vraie seulement tant que personne ne rend la
// description configurable. Un cliquet d'architecture existant a d'ailleurs
// rejete la premiere version de ce fichier, qui refaisait l'echappement.
// ============================================================

export default function AboutPage() {
  return (
    <>
      <JsonLdScript data={jsonLdPlateforme(SITE_URL, 'fr')} />
      <AboutContent />
    </>
  );
}
