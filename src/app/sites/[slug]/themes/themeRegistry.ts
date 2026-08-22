// src/app/sites/[slug]/themes/themeRegistry.ts
//
// Bloc 3 — Theme Registry. Décrit les 4 thèmes existants TELS QU'ILS SONT
// RÉELLEMENT AUJOURD'HUI (vérifié en lisant leur code, pas supposé), pas
// tels qu'on voudrait qu'ils soient. C'est la source de vérité déclarative
// que /edit (sélecteur de thème) et un futur système de recommandation
// pourront consulter — mais ce fichier ne CHANGE le comportement d'aucun
// thème, il le documente.
//
// Décision (validée) : supportedModes est "grandfathered" à [1, 2, 3] pour
// les 4 thèmes existants plutôt que restreint à [1] — deux sites réels en
// production (TechFlow, Cosmopo) tournent aujourd'hui en Mode 3 sur Vif et
// Noir respectivement. Les restreindre casserait leur rendu. `specialization`
// distingue "générique" (fonctionne partout, pas pensé pour un mode en
// particulier) de "mode-natif" (conçu dès le départ pour un mode) — aucun
// thème actuel n'est mode-natif, y compris Aurora malgré sa mise en page
// différente en mode Shop (voir note).

export type ThemeLayout = 'sequential' | 'shop-swap'

export type ThemeMetadata = {
  id: string
  name: string
  supportedModes: number[]
  specialization: 'generic'
  // Confirmé par le travail d'isolation Mode 1 (getModeCapabilities,
  // CartShell, tests dédiés) : true pour les 4 thèmes actuels — Noir et
  // Aurora l'ont rejoint via le Bloc 4 (getModeCapabilities() consolidé,
  // couvert par __tests__/noir-isolation.test.tsx et
  // __tests__/aurora-isolation.test.tsx).
  isolationVerified: boolean
  // 'sequential' : la section Shop est un bloc ajouté dans un flux narratif
  // fixe (Hero -> About -> [Shop] -> Gallery -> Témoignages -> Contact).
  // 'shop-swap' : le contenu principal est intégralement remplacé par une
  // mise en page catalogue (StorefrontDense) quand hasShop est vrai, au
  // lieu d'ajouter une section — structurellement plus proche de ce qui
  // sera visé pour de futurs thèmes Mode 2/3-natifs.
  layout: ThemeLayout
  // Identifiants de section réels, dans l'ordre réel du rendu, tels
  // qu'observés dans le code source (grep + lecture, pas une intention).
  // Vérifié automatiquement par __tests__/themeRegistry.test.ts (rendu
  // réel + présence des ids dans l'ordre déclaré) — évite que ce fichier
  // dérive silencieusement de la réalité au fil du temps.
  sectionOrder: string[]
  // Comment ce thème calcule aujourd'hui s'il doit afficher le Shop —
  // 'centralized' = passe par getModeCapabilities (Bloc "isolation Mode 1").
  // 'duplicated-inline' = recalcule sa propre copie de la même expression,
  // jamais consolidée — risque de divergence future. Les 4 thèmes actuels
  // sont 'centralized' (Noir/Aurora consolidés au Bloc 4) ; cette valeur
  // reste utile pour signaler un futur thème qui recopierait l'expression
  // au lieu de réutiliser getModeCapabilities.
  capabilitySource: 'centralized' | 'duplicated-inline'
  notes?: string
}

export const THEME_REGISTRY: ThemeMetadata[] = [
  {
    id: 'editorial',
    name: 'Editorial',
    supportedModes: [1, 2, 3],
    specialization: 'generic',
    isolationVerified: true,
    layout: 'sequential',
    sectionOrder: ['home', 'about', 'shop', 'gallery', 'testimonials', 'faq', 'contact'],
    capabilitySource: 'centralized',
  },
  {
    id: 'vif',
    name: 'Vif',
    supportedModes: [1, 2, 3],
    specialization: 'generic',
    isolationVerified: true,
    layout: 'sequential',
    sectionOrder: ['home', 'about', 'shop', 'gallery', 'testimonials', 'contact'],
    capabilitySource: 'centralized',
  },
  {
    id: 'noir',
    name: 'Noir',
    supportedModes: [1, 2, 3],
    specialization: 'generic',
    // Mis à jour (perfectionnement Noir/Deribfy) : NoirTheme.tsx importe et
    // appelle déjà getModeCapabilities() (un seul appel, hasShop dérivé de
    // cette unique source — vérifié en lisant le fichier, plus de
    // duplication à 3 endroits). Couvert par une suite de tests dédiée
    // (__tests__/noir-isolation.test.tsx, rendu réel via
    // renderToStaticMarkup, pas une lecture de code) qui vérifie
    // explicitement l'absence de Shop en Mode 1 y compris avec des produits
    // orphelins en base, et la cohérence de hasShop aux 3 anciens points de
    // duplication (ctaHref, nav, section). Les deux champs ci-dessous
    // étaient restés à leur valeur d'avant ce correctif alors que le code et
    // les tests avaient déjà changé — ce fichier se déclare lui-même
    // "source de vérité", il ne doit pas mentir sur l'état réel.
    isolationVerified: true,
    layout: 'sequential',
    sectionOrder: ['home', 'about', 'shop', 'gallery', 'testimonials', 'contact'],
    capabilitySource: 'centralized',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    supportedModes: [1, 2, 3],
    specialization: 'generic',
    // Mis à jour (perfectionnement Noir/Deribfy) : même constat que Noir —
    // AuroraTheme.tsx appelle déjà getModeCapabilities() une seule fois,
    // plus de duplication. Couvert par __tests__/aurora-isolation.test.tsx
    // (rendu réel), qui vérifie notamment que le Mode 1 ne bascule jamais
    // vers StorefrontDense, y compris avec des produits orphelins.
    isolationVerified: true,
    layout: 'shop-swap',
    sectionOrder: ['home'],
    capabilitySource: 'centralized',
    notes:
      "Seul thème dont le mode Shop remplace entièrement le contenu principal par StorefrontDense au lieu d'ajouter une section — structure la plus proche d'un futur thème Mode 2/3-natif.",
  },
]

export function getThemeMetadata(id: string): ThemeMetadata | undefined {
  return THEME_REGISTRY.find((t) => t.id === id)
}
