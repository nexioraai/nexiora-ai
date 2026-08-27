// src/lib/marketing/prompts.ts
// ============================================================
// LOT BLOG 2 -- LE MOTEUR DE PROMPTS MARKETING, EXTRAIT TEL QUEL.
//
// POURQUOI CE DEPLACEMENT. Le blog des sites clients doit reutiliser le
// generateur d'article qui existe deja -- `buildContentPrompt(site, brief,
// 'article')` -- sans dupliquer un seul prompt. Trois voies existaient, une
// seule est correcte :
//   * recopier les prompts dans une route blog -> DEUX copies de la meme
//     regle, qui divergeront. C'est exactement le defaut M2-02 ;
//   * appeler `/api/marketing/generate` en HTTP depuis la route blog -> un
//     saut reseau interne, une double authentification, un couplage au
//     format de reponse ;
//   * extraire les fonctions PURES ici, et les importer des deux cotes.
//
// CE MODULE NE CONTIENT QUE DES FONCTIONS PURES : aucune E/S, aucun appel
// reseau, aucune base, aucune authentification, aucun secret. C'est ce qui
// rend le deplacement sans effet observable -- les prompts sont recopies
// OCTET POUR OCTET depuis `src/app/api/marketing/generate/route.ts`
// (lignes 130-236), seuls les mots-cles `export` sont ajoutes.
//
// CE QUI N'A PAS BOUGE, ET NE DOIT PAS BOUGER :
//   * `sanitizeAreaServedForPrompt` reste dans `@/lib/site-profile/
//     areaServed`. C'est la PORTE DE PROMPT du CHANTIER 5, posee au point
//     d'entree pour couvrir aussi les valeurs deja en base. La deplacer ici
//     la couperait de son autre appelant (le prompt image, qui vit dans la
//     route et n'est pas extrait) et casserait son role d'autorite unique ;
//   * la construction de l'image (`generateSocialImage`, `fetchPexelsCover`)
//     reste dans la route : elle fait des appels reseau, elle n'est pas pure.
//
// `VALID_FORMATS` SUIT LES FONCTIONS, ET C'EST NECESSAIRE, PAS OPPORTUNISTE :
// `Format` en derive (`(typeof VALID_FORMATS)[number]`) et signe
// `buildContentPrompt`. Laisser la liste dans la route aurait impose soit de
// la redeclarer ici -- deux sources de verite pour la meme enumeration --
// soit d'importer le type depuis une route, ce qu'aucun module de `lib/` ne
// fait. La route continue de l'utiliser pour valider son entree.
// ============================================================

import { sanitizeAreaServedForPrompt } from '@/lib/site-profile/areaServed';

export const VALID_FORMATS = ['article', 'social', 'email'] as const;
export type Format = (typeof VALID_FORMATS)[number];

// ============ ÉTAPE 1 : BRIEF STRATÉGIQUE (mis en cache) ============
export function buildBriefPrompt(site: any): string {
  return `Tu es un stratège marketing senior. À partir des données réelles d'un business, 
tu produis un brief stratégique précis et actionnable — le genre qu'un consultant 
facturerait cher. Tu ne décris pas le business, tu le POSITIONNES.

DONNÉES DU BUSINESS :
- Nom : ${site.name || ''}
- Slogan : ${site.slogan || ''}
- Secteur : ${site.type || ''}
- Description : ${site.about || ''}
- Services : ${JSON.stringify(site.services || [])}
- Produits : ${JSON.stringify(site.products || [])}
- Mission : ${site.mission || ''}
- Vision : ${site.vision || ''}
- Zone desservie : ${sanitizeAreaServedForPrompt(site.area_served)}

Réponds UNIQUEMENT en JSON (sans markdown), dans la MÊME LANGUE que les données :

{
  "persona": {
    "profil": "Qui achète : âge, situation, contexte en 1 phrase concrète",
    "douleur": "Le problème réel que ce business résout pour lui",
    "declencheur": "Ce qui le pousse à acheter MAINTENANT"
  },
  "positionnement": "L'angle unique qui différencie ce business de ses concurrents — 1 phrase tranchante",
  "ton": "Le ton de voix nommé et décrit (ex: 'Chaleureux et expert, comme un artisan qui partage son savoir')",
  "mots_cles_seo": ["6 à 8 mots-clés réels que la cible taperait sur Google"],
  "angles": ["3 angles éditoriaux porteurs, spécifiques à ce business"],
  "canaux": ["Les 2-3 canaux prioritaires pour CETTE cible, justifiés en quelques mots"]
}

EXIGENCES :
- Spécifique à CE business, jamais générique. Si tu pourrais copier-coller la réponse 
  pour un autre business, c'est raté.
- Ancré dans la zone géographique et le secteur réels.
- Pas de jargon creux. Du concret qui guide la création de contenu.`;
}

// ============ ÉTAPE 2 : CONTENU (par format) ============
export function buildContentPrompt(site: any, brief: any, format: Format): string {
  const common = `Tu es un copywriter premium. Tu écris du contenu PRÊT-À-PUBLIER pour ce business,
en t'appuyant sur le brief stratégique ci-dessous. Tu respectes le ton défini,
tu parles à la persona, tu ancres dans la zone géographique réelle.

BRIEF STRATÉGIQUE :
${JSON.stringify(brief)}

BUSINESS : ${site.name || ''} — ${site.slogan || ''} | ${site.type || ''} | ${sanitizeAreaServedForPrompt(site.area_served)}

Écris dans la MÊME LANGUE que le brief. Réponds UNIQUEMENT en JSON, sans markdown.
Aucun placeholder type [Marque] : utilise le vrai nom. Pas de texte générique.`;

  if (format === 'article') {
    return `${common}

FORMAT : Article de blog SEO.
{
  "titre": "Accrocheur, contient le mot-clé principal, < 60 caractères",
  "meta_description": "140-155 caractères, donne envie de cliquer",
  "mots_cles": ["les mots-clés ciblés de cet article"],
  "structure": [
    {"niveau": "h1", "texte": "..."},
    {"niveau": "h2", "texte": "..."},
    {"niveau": "h3", "texte": "..."}
  ],
  "contenu": "L'article complet rédigé, 500-700 mots, paragraphes courts, ton du brief, se termine par un CTA naturel vers le business"
}`;
  }

  if (format === 'social') {
    return `${common}

FORMAT : 3 posts (Instagram, LinkedIn, Facebook), calibrés par plateforme.
{
  "instagram": {
    "texte": "Accroche forte ligne 1, court, émojis pertinents, CTA 'lien en bio'",
    "hashtags": ["8-12 hashtags ciblés, mix large et niche"]
  },
  "linkedin": {
    "texte": "Ton pro, angle expertise/valeur, 3-5 paragraphes courts, 1 question d'engagement"
  },
  "facebook": {
    "texte": "Chaleureux, communautaire, CTA clair, 1-2 émojis"
  }
}`;
  }

  // email
  return `${common}

FORMAT : Email de bienvenue (séquence automatisée).
{
  "objet": "< 50 caractères, taux d'ouverture élevé",
  "preheader": "Texte d'aperçu, complète l'objet, < 90 caractères",
  "corps": "Email complet : salutation personnalisée, accroche, valeur, offre de bienvenue si pertinent, CTA, signature au nom du business",
  "bouton_cta": "Texte du bouton, 2-4 mots"
}`;
}

export function parseJson(raw: string): any {
  const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}
