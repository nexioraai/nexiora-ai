// src/app/llms.txt/route.ts
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexiora-ai.vercel.app'

export function GET() {
  const body = `# Nexiora

> Nexiora est une plateforme canadienne premium de génération de sites web et d'applications de gestion d'entreprise par intelligence artificielle. Décrivez votre activité, et Nexiora crée en quelques secondes un site web professionnel ou un système de gestion sur mesure, multilingue et optimisé pour les moteurs de recherche (SEO) et les IA génératives (GEO).

## À propos
- Plateforme canadienne pilotée par intelligence artificielle
- Génération de sites web premium (multilingue, dans la langue de votre description)
- Génération d'applications de gestion d'entreprise : ERP, CRM, tableaux de bord, systèmes de gestion sur mesure
- Optimisé à la fois pour les moteurs de recherche (SEO) et les IA génératives (GEO)
- Abonnement mensuel unique, sans engagement
- Hébergement et mise en ligne inclus

## Liens
- [Accueil](${SITE_URL})
- [Créer un compte](${SITE_URL}/signup)
- [Connexion](${SITE_URL}/login)
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
