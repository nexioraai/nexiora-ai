// src/app/sites/[slug]/themes/checkSectionOrder.ts
//
// Vérifie qu'un rendu HTML contient bien, dans l'ordre déclaré, les
// identifiants de section attendus. Ne connaît rien d'un thème en
// particulier — prend un HTML et une liste d'ids, un point. Extrait pour
// être appliqué aussi bien aux 4 thèmes réels (themeRegistry.test.tsx) qu'à
// un thème fictif jetable (Bloc 5 — extensibilityProof.test.ts), preuve que
// la vérification elle-même généralise, pas seulement le registre.

export type SectionOrderResult = {
  ok: boolean
  missing: string[]
  outOfOrder: boolean
}

export function checkSectionOrder(html: string, sectionOrder: string[]): SectionOrderResult {
  const missing: string[] = []
  const positions: number[] = []

  for (const sectionId of sectionOrder) {
    const idx = html.indexOf(`id="${sectionId}"`)
    if (idx === -1) {
      missing.push(sectionId)
    } else {
      positions.push(idx)
    }
  }

  const sorted = [...positions].sort((a, b) => a - b)
  const outOfOrder = missing.length === 0 && JSON.stringify(positions) !== JSON.stringify(sorted)

  return { ok: missing.length === 0 && !outOfOrder, missing, outOfOrder }
}
