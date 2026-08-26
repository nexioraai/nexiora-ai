import { IDENTITE_FR, IDENTITE_EN, VERIFIE_LE } from './manifeste'

// ============================================================
// SURFACE DERIVEE -- LE BALISAGE VIENT DU MANIFESTE, PAS D'UNE REDACTION.
//
// `description` reprend la phrase d'identite canonique AU CARACTERE PRES : un
// balisage qui decrirait Deribfy autrement que ses pages serait une seconde
// verite, structuree et donc plus credible aux yeux d'un moteur.
//
// POURQUOI `SoftwareApplication` ET NON `Product`. `Product` designe un bien
// vendu, avec ses offres et ses references. Deribfy est un logiciel ; ses
// CLIENTS publient des `Product` sur leurs boutiques. Employer `Product` ici
// confondrait les deux niveaux et suggererait que Deribfy vend des articles.
//
// CE QUI N'Y FIGURE PAS, DELIBEREMENT : aucune capacite conditionnelle, aucun
// prix, aucun chiffre de clientele. Un balisage affirmant une capacite sans
// dire a quel type de site elle appartient serait un mensonge structure --
// plus dangereux qu'une phrase, parce qu'une machine le lit comme un fait.
//
// NON MONTE. Le layout racine enveloppe AUSSI les sites clients : y placer ce
// balisage attribuerait chaque site client a Deribfy. Le choix de la page
// d'entite canonique est une decision produit, pas une decision de redaction.
// ============================================================

export function jsonLdPlateforme(siteUrl: string, langue: 'fr' | 'en' = 'fr') {
  const description = langue === 'fr' ? IDENTITE_FR : IDENTITE_EN

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Deribfy',
      url: siteUrl,
      description,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Deribfy',
      url: siteUrl,
      inLanguage: langue,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Deribfy',
      url: siteUrl,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description,
      publisher: { '@type': 'Organization', name: 'Deribfy' },
      dateModified: VERIFIE_LE,
    },
  ] as const
}
