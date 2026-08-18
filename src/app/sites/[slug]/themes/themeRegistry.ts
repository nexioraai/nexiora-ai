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
  // CartShell, tests dédiés) : true seulement pour Editorial et Vif.
  // Noir et Aurora n'ont jamais été audités pour ce même risque de
  // couplage — c'est explicitement le périmètre du Bloc 4, pas de celui-ci.
  isolationVerified: boolean
  // 'sequential' : la section Shop est un bloc ajouté dans un flux narratif
  // fixe (Hero -> About -> [Shop] -> Gallery -> Témoignages -> Contact).
  // 'shop-swap' : le contenu principal est intégralement remplacé par une
  // mise en page catalogue (StorefrontDense) quand hasShop est vrai, au
  // lieu d'ajouter une section — structurellement plus proche de ce qui
  // sera visé pour de futurs thèmes Mode 2/3-natifs, mais non vérifié pour
  // autant (voir isolationVerified).
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
  // jamais consolidée — risque de divergence future, candidat du Bloc 4.
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
    isolationVerified: false,
    layout: 'sequential',
    sectionOrder: ['home', 'about', 'shop', 'gallery', 'testimonials', 'contact'],
    capabilitySource: 'duplicated-inline',
    notes:
      "L'expression de capacité (mode !== 1 && (products.length > 0 || mode === 3)) est recopiée telle quelle à 3 endroits du fichier (ctaHref, nav, section Shop) — jamais consolidée via getModeCapabilities. Pas de bug actif détecté (les 3 copies sont identiques entre elles), mais aucune protection contre une future divergence.",
  },
  {
    id: 'aurora',
    name: 'Aurora',
    supportedModes: [1, 2, 3],
    specialization: 'generic',
    isolationVerified: false,
    layout: 'shop-swap',
    sectionOrder: ['home'],
    capabilitySource: 'duplicated-inline',
    notes:
      "Seul thème dont le mode Shop remplace entièrement le contenu principal par StorefrontDense au lieu d'ajouter une section — structure la plus proche d'un futur thème Mode 2/3-natif, mais jamais vérifiée pour l'isolation Mode 1. Même expression de capacité dupliquée (non centralisée) que Noir.",
  },
]

export function getThemeMetadata(id: string): ThemeMetadata | undefined {
  return THEME_REGISTRY.find((t) => t.id === id)
}
