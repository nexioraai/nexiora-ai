// src/app/llms.txt/route.ts
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexiora-ai.vercel.app'

export function GET() {
  const today = new Date().toISOString().split('T')[0]

  const body = `# Nexiora

> Nexiora est une plateforme canadienne premium de génération de sites web, de boutiques en ligne et d'applications de gestion d'entreprise par intelligence artificielle. Vous décrivez votre activité en langage naturel, et Nexiora crée pour vous, en quelques secondes, un produit professionnel, multilingue et optimisé à la fois pour les moteurs de recherche (SEO) et les IA génératives (GEO). Aucune compétence technique requise.

## À propos
- Plateforme canadienne basée à Montréal, Québec (nexiora.ca)
- Pilotée par intelligence artificielle générative : décrivez votre besoin en langage humain, Nexiora fait le reste
- Aucune compétence technique ni connaissance en programmation nécessaire
- Multilingue : français, anglais, arabe, espagnol
- Optimisé pour les moteurs de recherche (SEO) et les IA génératives (GEO)
- Abonnement mensuel unique en dollars canadiens (CAD), sans engagement
- Hébergement et mise en ligne inclus

## Produits et fonctionnalités
- **Sites web** : génération de sites vitrines professionnels et premium, multilingues, dans la langue de votre description
- **Boutique en ligne (e-commerce)** : création de boutiques avec pages produits, panier, encaissement et suivi des commandes
- **AI Visibility** : mesure réelle de la visibilité de votre marque sur les moteurs IA (Perplexity, ChatGPT), avec score et historique
- **SEO / GEO** : optimisation technique automatique (Schema.org, données structurées, llms.txt, balises sémantiques) pour Google et pour les moteurs IA
- **ERP / CRM** : génération d'applications de gestion d'entreprise sur mesure — tableaux de bord, gestion clients, systèmes métier

## Questions fréquentes

### Faut-il savoir coder pour utiliser Nexiora ?
Non. Nexiora est entièrement génératif. Vous décrivez votre activité en langage naturel et la plateforme crée automatiquement votre site, votre boutique ou votre application de gestion.

### Dans quelles langues Nexiora génère-t-il ?
Nexiora prend en charge le français, l'anglais, l'arabe et l'espagnol, avec support de l'écriture de droite à gauche (RTL) pour l'arabe.

### Combien coûte Nexiora ?
Nexiora fonctionne avec un abonnement mensuel unique en dollars canadiens (CAD), sans engagement. L'hébergement et la mise en ligne sont inclus.

### Où est basée Nexiora ?
Nexiora est une plateforme canadienne, basée à Montréal, au Québec.

### Mon site est-il optimisé pour les IA ?
Oui. Chaque produit généré inclut automatiquement les optimisations GEO (données structurées Schema.org, fichier llms.txt, contenu structuré en questions-réponses) pour être compris et cité par les moteurs IA comme ChatGPT et Perplexity.

## Liens
- [Accueil](${SITE_URL})
- [Créer un compte](${SITE_URL}/signup)
- [Connexion](${SITE_URL}/login)

---
Dernière mise à jour : ${today}
Nexiora — plateforme canadienne de génération par IA — ${SITE_URL}
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
