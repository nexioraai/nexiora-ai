// ============================================================
// CHANTIER 1 (MODE 1) -- `sections` EST LA SOURCE CANONIQUE.
//
// CE QUI EXISTAIT, MESURE SUR LE SITE REEL. Les trois outils « service » de
// l'agent ecrivaient dans `site.services`. Or AUCUN des quatre themes ne lit
// cette colonne : Editorial, Vif et Noir rendent `site.sections`, et le
// generateur ne produit meme pas `services` -- il est absent du schema zod.
// Sur yiaglobalcommodities.com (Mode 1, theme Vif), les six offres visibles
// vivent dans `sections[0].items`, et `services` vaut `[]`.
//
// Consequence : un marchand demandait a l'agent d'ajouter un service, la
// carte d'approbation s'affichait, l'ecriture reussissait -- et le site ne
// changeait jamais. Sans erreur, sans signal. L'agent ne voyait meme pas les
// offres reelles, `services` etant seul present dans son contexte : interroge
// sur ses services, il aurait repondu « aucun » devant six offres affichees.
//
// VOLUMETRIE VERIFIEE EN PRODUCTION avant ce chantier : 0 site porte des
// `services` non vides. Aucune migration de donnees n'etait donc necessaire,
// et la colonne n'est PAS supprimee -- elle cesse simplement d'etre lue et
// ecrite par ce chemin.
//
// ============================================================
// CE MODULE TERMINE AUSSI LA DETTE 4.
//
// Cette dette avait retire l'adressage par INDEX de `testimonials` et de
// `gallery`. Sa portee s'arretait la. Les outils « service » etaient la
// TROISIEME liste, et ils adressaient encore par index :
//
//     const { index } = tool_input;
//     updates.services = currentServices.filter((_, i) => i !== index);
//
// Le modele ne pouvait que DEVINER une position, et rien ne s'opposait a une
// devinette dans les bornes : elle supprimait le mauvais element, en silence.
// L'adressage se fait desormais par TITRE, avec la meme regle que
// `resolveProductByName` -- egalite stricte apres normalisation, aucune
// sous-chaine, et REFUS sur ambiguite. Plusieurs resultats = aucune ecriture.
//
// NORMALISATION : `trim` + minuscules, comme `productResolution`. Un titre
// d'offre est du texte editorial, pas une URL -- contrairement a
// `galleryResolution`, ou replier la casse detruirait la cible.
// ============================================================

/** La forme minimale qu'un item d'offre doit presenter pour etre resolu. */
export type SectionItem = { title?: string | null };

/** La forme minimale d'une section : un nom, et des items. */
export type Section = { name?: string | null; items?: SectionItem[] | null };

export type SectionItemResolution =
  | { ok: true; sectionIndex: number; itemIndex: number; sectionName: string }
  | { ok: false; reason: 'not_found'; query: string }
  | { ok: false; reason: 'ambiguous'; query: string; sections: string[] };

export type SectionResolution =
  | { ok: true; sectionIndex: number; sectionName: string }
  | { ok: false; reason: 'not_found'; query: string }
  | { ok: false; reason: 'ambiguous'; query: string; sections: string[] };

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function sectionsOf(raw: unknown): Section[] {
  return Array.isArray(raw) ? (raw as Section[]) : [];
}

function itemsOf(section: Section): SectionItem[] {
  return Array.isArray(section?.items) ? section.items : [];
}

/** Le nom affichable d'une section, pour les messages d'ambiguite. */
export function sectionLabel(section: Section, index: number): string {
  const nom = typeof section?.name === 'string' ? section.name.trim() : '';
  return nom !== '' ? nom : `section ${index + 1}`;
}

/**
 * Retrouve UN item d'offre par son titre, dans TOUTES les sections.
 *
 * RECHERCHE GLOBALE, ET C'EST VOULU. Le marchand parle d'une offre par son
 * nom (« retire Sesame Seeds Grade A »), pas par la section qui la contient.
 * Lui imposer de nommer une section qu'il ne percoit pas comme telle
 * deplacerait la charge de la precision du mauvais cote.
 *
 * PLUSIEURS RESULTATS = AUCUNE ECRITURE. Rien n'impose l'unicite des titres
 * entre sections. Choisir « le premier » serait exactement la modification
 * silencieuse du mauvais element que la dette 4 a servi a defaire.
 */
export function resolveSectionItem(
  rawSections: unknown,
  rawTitle: unknown
): SectionItemResolution {
  const query = typeof rawTitle === 'string' ? rawTitle : '';
  const needle = normalize(query);
  if (needle === '') return { ok: false, reason: 'not_found', query };

  const sections = sectionsOf(rawSections);
  const matches: { s: number; i: number; label: string }[] = [];

  sections.forEach((section, s) => {
    itemsOf(section).forEach((item, i) => {
      if (normalize(item?.title ?? '') === needle) {
        matches.push({ s, i, label: sectionLabel(section, s) });
      }
    });
  });

  if (matches.length === 0) return { ok: false, reason: 'not_found', query };
  if (matches.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous',
      query,
      sections: matches.map((m) => m.label),
    };
  }
  const [only] = matches;
  return { ok: true, sectionIndex: only.s, itemIndex: only.i, sectionName: only.label };
}

/**
 * Determine DANS QUELLE SECTION ajouter une offre.
 *
 * AUCUN REPLI ARBITRAIRE, c'est la regle gelee :
 *   · un nom de section fourni -> egalite stricte ; 0 = introuvable,
 *     >1 = ambigu ;
 *   · aucun nom fourni et UNE seule section -> elle, sans ambiguite possible ;
 *   · aucun nom fourni et 0 ou plusieurs sections -> REFUS, avec la liste des
 *     sections disponibles. Choisir « la premiere » serait un repli arbitraire.
 */
export function resolveTargetSection(
  rawSections: unknown,
  rawSectionName: unknown
): SectionResolution {
  const sections = sectionsOf(rawSections);
  const demande = typeof rawSectionName === 'string' ? rawSectionName : '';

  if (normalize(demande) !== '') {
    const needle = normalize(demande);
    const matches = sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => normalize(section?.name ?? '') === needle);

    if (matches.length === 0) return { ok: false, reason: 'not_found', query: demande };
    if (matches.length > 1) {
      return {
        ok: false,
        reason: 'ambiguous',
        query: demande,
        sections: matches.map((m) => sectionLabel(m.section, m.index)),
      };
    }
    const [only] = matches;
    return { ok: true, sectionIndex: only.index, sectionName: sectionLabel(only.section, only.index) };
  }

  if (sections.length === 1) {
    return { ok: true, sectionIndex: 0, sectionName: sectionLabel(sections[0], 0) };
  }

  return {
    ok: false,
    reason: 'ambiguous',
    query: '',
    sections: sections.map((s, i) => sectionLabel(s, i)),
  };
}

/** Message rendu a l'agent. Il NOMME les sections concernees, pour que la
 *  question posee au marchand soit precise plutot que generique. */
export function sectionItemMessage(
  r: Extract<SectionItemResolution | SectionResolution, { ok: false }>
): string {
  if (r.reason === 'not_found') {
    return r.query.trim() === ''
      ? 'Aucun titre fourni. Precisez l\'offre concernee, exactement comme elle apparait sur le site.'
      : `Aucune offre ne porte exactement le titre "${r.query}". Verifiez l'orthographe telle qu'elle apparait sur le site.`;
  }
  const liste = r.sections.join(', ');
  return r.query.trim() === ''
    ? `Plusieurs sections existent (${liste}). Precisez laquelle doit recevoir cette offre.`
    : `Plusieurs offres portent le titre "${r.query}" (${liste}). Precisez laquelle, aucune modification n'a ete faite.`;
}
