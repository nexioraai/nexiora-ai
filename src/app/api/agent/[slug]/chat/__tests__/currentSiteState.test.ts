import { describe, it, expect } from 'vitest'
import { toolNamesForSite } from '@/lib/agent-tools/toolCapabilities'
import { readFileSync } from 'fs'
import { join } from 'path'

// ============================================================
// DETTE 4 (volet testimonials) — L'INDEX N'ÉTAIT PAS LE DÉFAUT.
//
// `propose_testimonial_remove` et `_update` adressent par index de tableau.
// `propose_remove_service` et `propose_service_update` AUSSI — et ceux-là
// fonctionnent, parce que `services` figure dans CURRENT SITE STATE.
//
// Le défaut était donc l'absence de `testimonials` dans ce contexte : le
// modèle ne pouvait que DEVINER un index, et `/apply` n'opposait qu'un
// contrôle d'intervalle. Une devinette dans les bornes supprimait le mauvais
// témoignage, sans erreur.
//
// La correction tient en une ligne, et ces tests bornent exactement ce
// qu'elle a le droit de changer.
//
// Test structurel : ce contexte est un littéral de gabarit construit dans le
// corps de la route, non exporté et non invocable sans mocker tout le SDK
// Anthropic. Même méthodologie que `inventoryToolExposure.test.ts` et
// `OrderManager.processingVisibility.test.ts` — on lit le source réel, avec
// des motifs précis qui ignorent les commentaires.
// ============================================================

const CHAT = readFileSync(join(__dirname, '../route.ts'), 'utf-8')
const APPLY = readFileSync(join(__dirname, '../../apply/route.ts'), 'utf-8')
const CARD = readFileSync(join(__dirname, '../../../../../../components/edit/AIAgentChat.tsx'), 'utf-8')

/** L'objet littéral de CURRENT SITE STATE, commentaires retirés. */
function contexte(): string {
  const bloc = CHAT.match(/\$\{JSON\.stringify\(\n {2}\{[\s\S]*?\n {2}\},/)![0]
  return bloc.replace(/^\s*\/\/.*$/gm, '')
}

/** Les clés de premier niveau réellement exposées au modèle. */
function champs(): string[] {
  return [...contexte().matchAll(/^ {4}([a-z_]+):/gm)].map((m) => m[1])
}

describe('DETTE 4 — `testimonials` dans CURRENT SITE STATE', () => {
  it('le champ est présent', () => {
    expect(champs()).toContain('testimonials')
  })

  it('la valeur exposée est EXACTEMENT `site.testimonials` — aucune projection', () => {
    // Une normalisation montrerait au modèle une forme qui n'existe pas telle
    // quelle en base : `normalizeTestimonial` tolère `company`, `text` et
    // `message`, et `Navbar` lit aussi `author`.
    expect(contexte()).toMatch(/^ {4}testimonials: site\.testimonials,$/m)
    expect(contexte()).not.toMatch(/testimonials:\s*\(site\.testimonials/)
    expect(contexte()).not.toMatch(/testimonials:.*\.map\(/)
    expect(contexte()).not.toMatch(/testimonials:.*normalize/i)
  })

  // CHANTIER 4 — 17 → 19. `faq` et `whyus` entrent au contexte : le
  // générateur les produit toujours, les quatre thèmes les rendent, et
  // l'adressage par question/titre des six nouveaux outils en dépend
  // directement. Le compte avance, le cliquet reste.
  // CHANTIER 5 — 19 → 21. `area_served` et `price_range` entrent : l'agent
  // peut désormais les ÉCRIRE, il doit donc pouvoir les LIRE. Le compte
  // avance, le cliquet reste — c'est lui qui oblige à justifier chaque champ.
  it('le contexte porte 21 champs — 19 + area_served + price_range', () => {
    expect(champs()).toHaveLength(21)
  })

  // CHANTIER 1 (MODE 1) — CE CLIQUET A CHANGÉ DE CAMP.
  //
  // Il constatait que `services` figurait au contexte, comme précédent d'un
  // adressage par index. La mesure sur un site réel a montré que ce précédent
  // était faux : aucun thème ne rend `services`, le générateur ne le produit
  // pas, et l'agent lisait donc `[]` devant six offres affichées. La source
  // canonique est `sections` — et l'adressage se fait par titre.
  it('`sections` a remplacé `services` — l\'agent voit ce que le visiteur voit', () => {
    expect(contexte()).toMatch(/^ {4}sections: site\.sections,$/m)
    expect(contexte()).not.toMatch(/^ {4}services: site\.services,$/m)
  })

  it('les 21 champs, dans le même ordre — area_served et price_range après whyus', () => {
    expect(champs()).toEqual([
      'name', 'slogan', 'type', 'about', 'hero_title', 'hero_subtitle',
      'primary_color', 'theme', 'cta', 'mode', 'dropship_type', 'sections',
      'testimonials',
      'faq', 'whyus',
      'area_served', 'price_range',
      'social_links', 'contact', 'cj_margin_percent', 'lang',
    ])
  })

  it('AUCUN autre tableau n\'a été injecté au passage', () => {
    // `products` et `gallery` relèvent d'autres volets, déjà tranchés
    // autrement. Les faire entrer ici serait sortir du périmètre.
    for (const absent of ['products', 'gallery', 'pod_designs', 'menu', 'team']) {
      expect(champs(), absent).not.toContain(absent)
    }
  })
})

describe('DETTE 4 — sérialisation : aucune forme ne peut faire échouer le contexte', () => {
  // Ces cas vérifient l'HYPOTHÈSE sur laquelle repose l'exposition brute :
  // `JSON.stringify` traverse n'importe quelle valeur de `site.testimonials`
  // sans lever. Ils ne testent pas du code applicatif — ils constatent que
  // l'exposition brute est sûre pour toutes les formes réellement observées.
  const CAS: Array<[string, unknown]> = [
    ['tableau vide', []],
    ['absent (undefined)', undefined],
    ['null', null],
    ['non-tableau (chaîne)', 'pas un tableau'],
    ['non-tableau (objet)', { 0: { name: 'x' } }],
    ['forme canonique', [{ name: 'Alice', role: 'CEO', content: 'Super', rating: 5 }]],
    ['forme historique `text`', [{ name: 'Bob', text: 'Ancien champ' }]],
    ['forme historique `company`', [{ name: 'Carol', company: 'ACME', content: 'x' }]],
    ['forme historique `author`', [{ author: 'Dan', content: 'x' }]],
    ['élément null', [null]],
    ['mélange de formes', [{ name: 'A', content: 'x' }, { author: 'B', text: 'y' }, null]],
  ]

  for (const [label, testimonials] of CAS) {
    it(`${label} -> sérialisé sans lever`, () => {
      expect(() => JSON.stringify({ name: 'S', services: [], testimonials, lang: 'fr' }, null, 2)).not.toThrow()
    })
  }

  it('les formes historiques sont transmises TELLES QUELLES', () => {
    const testimonials = [{ author: 'Dan', text: 'Ancien', company: 'ACME' }]
    const json = JSON.parse(JSON.stringify({ testimonials }))
    // Le modèle voit la réalité de la base, pas une projection qui la masque.
    expect(json.testimonials[0]).toEqual({ author: 'Dan', text: 'Ancien', company: 'ACME' })
  })
})

describe('DETTE 4 — NON-RÉGRESSION : rien d\'autre n\'a bougé', () => {
  it('les TROIS outils testimonials conservent leurs schémas', () => {
    const bloc = (nom: string) =>
      CHAT.match(new RegExp(`name: '${nom}',[\\s\\S]*?required: \\[[^\\]]*\\],`))![0]

    // `add` : aucun ciblage, inchangé.
    expect(bloc('propose_testimonial_add')).toMatch(/required: \['name', 'content', 'rating', 'reason'\]/)
    expect(bloc('propose_testimonial_add')).not.toMatch(/\bindex\b/)

    // `remove` et `update` : TOUJOURS par index. L'injection rend cet index
    // connaissable ; elle ne le remplace pas.
    for (const nom of ['propose_testimonial_remove', 'propose_testimonial_update']) {
      expect(bloc(nom), nom).toMatch(/index:\s*\{\s*type:\s*'integer'\s*\}/)
    }
    expect(bloc('propose_testimonial_remove')).toMatch(/required: \['index', 'reason'\]/)
    expect(bloc('propose_testimonial_update')).toMatch(/required: \['index', 'field', 'value', 'reason'\]/)
  })

  it('AUCUNE résolution par valeur n\'a été introduite pour les testimonials', () => {
    // L'arbitrage est explicite : pas de clé composite, pas de résolution par
    // nom, texte, auteur ou contenu. `name` n'est pas unique.
    const code = APPLY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const branche of ['propose_testimonial_remove', 'propose_testimonial_update']) {
      const bloc = code.match(new RegExp(`case '${branche}': \\{[\\s\\S]*?\\n      \\}`))![0]
      expect(bloc, branche).toContain('const { index')
      expect(bloc, branche).not.toContain('resolveProductByName')
      expect(bloc, branche).not.toContain('resolveGalleryImage')
      expect(bloc, branche).not.toMatch(/testimonial_name|author_name|by_content/)
    }
  })

  it('`gallery` reste adressée par `image_url` (volet précédent intact)', () => {
    const bloc = CHAT.match(/name: 'propose_gallery_remove',[\s\S]*?required: \[[^\]]*\],/)![0]
    expect(bloc).toMatch(/image_url:\s*\{\s*type:\s*'string'/)
    expect(bloc).not.toMatch(/\bindex\b/)
  })

  it('les outils testimonials restent exposés aux Modes 1 et 2 SEULEMENT', () => {
    // ÉTAPE 3 — cliquet devenu comportemental : la règle est appelée, plus
    // cherchée dans le texte de la route (voir toolCapabilities.ts).
    for (const nom of ['propose_testimonial_add', 'propose_testimonial_remove', 'propose_testimonial_update']) {
      expect(toolNamesForSite(1, null), nom).toContain(nom)
      expect(toolNamesForSite(2, null), nom).toContain(nom)
      expect(toolNamesForSite(3, null), nom).not.toContain(nom)
      expect(toolNamesForSite(4, null), nom).not.toContain(nom)
    }
  })

  it('`AIAgentChat.tsx` est INTACT — les cartes restent en `#index`', () => {
    // Arbitrage 2 : l'UX des cartes n'entre pas dans ce volet.
    expect(CARD).toContain('Remove testimonial #{input.index}')
    expect(CARD).toMatch(/Update testimonial #\{input\.index\}/)
  })
})
