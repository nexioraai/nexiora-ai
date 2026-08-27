// Intitules fabriques par les pages elles-memes. Ils suivent la langue DU SITE,
// jamais une langue en dur -- meme regle que `getLlmsTxtLabels` (CHANTIER 8) et
// que `not-found.tsx`. Aucun contenu du marchand n'est traduit ici.
export type BlogLabels = { blog: string; vide: string; retour: string; accueil: string }

const COPY: Record<string, BlogLabels> = {
  fr: { blog: 'Blog', vide: 'Aucun article pour le moment.', retour: '← Tous les articles', accueil: "← Retour à l'accueil" },
  en: { blog: 'Blog', vide: 'No articles yet.', retour: '← All articles', accueil: '← Back to home' },
  es: { blog: 'Blog', vide: 'Aún no hay artículos.', retour: '← Todos los artículos', accueil: '← Volver al inicio' },
  ar: { blog: 'المدونة', vide: 'لا توجد مقالات بعد.', retour: '← كل المقالات', accueil: '← العودة إلى الصفحة الرئيسية' },
}

export function getBlogLabels(lang: string | null | undefined): BlogLabels {
  return COPY[(lang ?? 'fr').slice(0, 2)] ?? COPY.fr
}

/**
 * Tronque une description a la longueur utile d'un extrait de resultat.
 *
 * 160 caracteres, coupe a 157 + ellipse : MEME regle que `/sites/[slug]/page.tsx`
 * et que la fiche produit. Rendre une valeur unique pour cette borne evite que
 * trois surfaces du meme site annoncent trois longueurs differentes.
 */
export function tronquer(texte: string | null | undefined): string | undefined {
  const t = (texte ?? '').trim()
  if (!t) return undefined
  return t.length > 160 ? t.slice(0, 157).trimEnd() + '\u2026' : t
}

/** Date lisible dans la langue du site. Rend `null` si la date est absente. */
export function formatDate(iso: string | null, lang: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return d.toLocaleDateString((lang ?? 'fr').slice(0, 2), { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return d.toISOString().slice(0, 10)
  }
}
