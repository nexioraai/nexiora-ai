// src/app/llms.txt/route.ts
//
// ============================================================
// SURFACE DERIVEE -- NE PAS REDIGER ICI.
//
// Ce fichier est ASSEMBLE a partir de `documentation/manifeste.ts`. Il ne
// contient aucune phrase qui lui soit propre : chaque fait vient du corpus
// canonique. C'est la seule facon d'empecher qu'il le contredise.
//
// POURQUOI CETTE REGLE EXISTE. La version precedente etait ecrite a la main.
// Elle affirmait une capacite que le produit n'a pas, et sous-declarait le
// nombre de langues d'un facteur neuf. Une surface libre de dire ce qu'elle
// veut finit par dire autre chose que le produit.
//
// Pour modifier ce contenu : modifier le manifeste, jamais ce fichier.
// ============================================================
import {
  IDENTITE_FR,
  CONCENTRIQUE_FR,
  IMMEDIAT_FR,
  NIVEAUX,
  VERIFIE_LE,
} from '../../../documentation/manifeste'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.deribfy.com'

export function GET() {
  const niveaux = NIVEAUX.map(
    (n) =>
      `### ${n.fr}\n` +
      `Portee : ${n.portee}.\n` +
      n.capacites_fr.map((c) => `- ${c}`).join('\n')
  ).join('\n\n')

  const body = `# Deribfy

> ${IDENTITE_FR}

## Capacites

${CONCENTRIQUE_FR}

${niveaux}

## Parcours

Creer un site avec Deribfy suit six etapes : decrire son activite, laisser le
site se generer, l'editer, le previsualiser en prive, le publier en activant
l'abonnement, puis continuer a le modifier. Les six etapes sont les memes pour
les trois types de site.

${IMMEDIAT_FR}

## Ce que Deribfy prepare pour les moteurs

Chaque site publie dispose d'un sitemap, d'un fichier robots, de donnees
structurees, d'un fichier llms.txt et d'URLs stables avec une page dediee par
produit. Pour un domaine personnalise, la verification de propriete aupres de
Google et la soumission du sitemap sont automatisees.

Deribfy prepare et automatise le travail technique. Google decide seul de
l'indexation et du classement. Aucun service ne peut promettre une position
dans les resultats de recherche.

## Limites

- Le type de site est fixe a la creation et ne peut pas etre change ensuite.
- Un site n'est pas accessible publiquement avant l'activation de l'abonnement.
- Si l'abonnement s'arrete, le site est retire de la ligne.
- Les sites clients ne comportent pas de blog.
- Google decide de l'indexation et du classement.

## Documentation

- [Qu'est-ce que Deribfy ?](${SITE_URL}/documentation/identite)
- [Comment ca marche](${SITE_URL}/documentation/comment-ca-marche)
- [Types de site et capacites](${SITE_URL}/documentation/types-et-capacites)
- [Generation et edition](${SITE_URL}/documentation/generation-et-edition)
- [Boutique en ligne](${SITE_URL}/documentation/boutique-en-ligne)
- [Dropshipping](${SITE_URL}/documentation/dropshipping)
- [Marketing et contenu](${SITE_URL}/documentation/marketing-et-contenu)
- [SEO, Google et visibilite IA](${SITE_URL}/documentation/seo-google-visibilite-ia)
- [Domaines](${SITE_URL}/documentation/domaines)
- [Limites](${SITE_URL}/documentation/limites)
- [Questions frequentes](${SITE_URL}/documentation/faq)
- [Glossaire](${SITE_URL}/documentation/glossaire)

## Liens

- [Accueil](${SITE_URL})

Derniere verification : ${VERIFIE_LE}
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
