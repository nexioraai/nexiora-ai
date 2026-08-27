import { describe, it, expect } from 'vitest';
import {
  resolveSectionItem,
  resolveTargetSection,
  sectionItemMessage,
  sectionLabel,
} from '../sectionItemResolution';

// ============================================================
// CHANTIER 1 (MODE 1) — ADRESSAGE DES OFFRES PAR TITRE.
//
// Les trois outils « service » écrivaient `site.services` — colonne qu'aucun
// thème ne rend et que le générateur ne produit pas — et adressaient par
// INDEX. Sur yiaglobalcommodities.com, les six offres visibles vivent dans
// `sections[0].items` et `services` vaut `[]` : l'écriture réussissait, le
// site ne changeait jamais.
//
// Ce module est la TROISIÈME liste de la dette 4, celle que sa portée
// n'avait pas atteinte. Même règle que `productResolution` : égalité stricte
// après normalisation, aucune sous-chaîne, REFUS sur ambiguïté.
// ============================================================

/** La forme réelle de `sections` sur YIA, réduite à ce que le résolveur lit. */
const YIA = [
  {
    name: 'Our Products',
    items: [
      { title: 'Sesame Seeds Grade A' },
      { title: 'Gum Arabic Acacia Senegal' },
      { title: 'Sesame Seeds Bulk Orders (25MT containers)' },
      { title: 'Gum Arabic Wholesale Distribution' },
      { title: 'SGS Certificate of Analysis (CoA) Testing' },
      { title: 'Custom Sourcing & Farmer Partnerships' },
    ],
  },
];

const DEUX_SECTIONS = [
  { name: 'Produits', items: [{ title: 'Sésame' }, { title: 'Commun' }] },
  { name: 'Services', items: [{ title: 'Logistique' }, { title: 'Commun' }] },
];

describe('CHANTIER 1 — résolution d’une offre par son titre', () => {
  it('titre exact -> une seule cible, avec sa section', () => {
    const r = resolveSectionItem(YIA, 'Gum Arabic Acacia Senegal');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sectionIndex).toBe(0);
      expect(r.itemIndex).toBe(1);
      expect(r.sectionName).toBe('Our Products');
    }
  });

  it('la casse et les espaces autour sont normalisés', () => {
    for (const q of ['  sesame seeds grade a  ', 'SESAME SEEDS GRADE A']) {
      const r = resolveSectionItem(YIA, q);
      expect(r.ok, q).toBe(true);
      if (r.ok) expect(r.itemIndex).toBe(0);
    }
  });

  it('🔴 AUCUNE sous-chaîne — un fragment ne désigne RIEN, même s’il est unique', () => {
    // TROU TROUVÉ PAR MUTATION (C1-M3). La première version n'assertait que
    // `.ok === false` : avec une recherche par sous-chaîne, « Sesame Seeds »
    // frappait DEUX items et repartait en `ambiguous` — donc `.ok === false`
    // aussi, et la mutation passait verte. Ce qui distingue les deux règles
    // est un fragment qui ne matche QU'UN item : la sous-chaîne l'accepterait
    // en silence, l'égalité stricte le refuse. Et la RAISON compte autant que
    // l'échec.
    const unique = resolveSectionItem(YIA, 'SGS Certificate');   // 1 seul item le contient
    expect(unique).toMatchObject({ ok: false, reason: 'not_found' });

    const multiple = resolveSectionItem(YIA, 'Sesame Seeds');    // 2 items le contiennent
    expect(multiple).toMatchObject({ ok: false, reason: 'not_found' });

    expect(resolveSectionItem(YIA, 'Gum Arabic')).toMatchObject({ ok: false, reason: 'not_found' });
    expect(resolveSectionItem(YIA, 'Grade A')).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('titre absent -> not_found, jamais une cible approchante', () => {
    const r = resolveSectionItem(YIA, 'Cacao');
    expect(r).toMatchObject({ ok: false, reason: 'not_found', query: 'Cacao' });
  });

  it('🔴 titre présent dans DEUX sections -> ambiguous, et les sections sont nommées', () => {
    const r = resolveSectionItem(DEUX_SECTIONS, 'Commun');
    expect(r).toMatchObject({ ok: false, reason: 'ambiguous' });
    if (!r.ok && r.reason === 'ambiguous') {
      expect(r.sections).toEqual(['Produits', 'Services']);
    }
  });

  it('entrées dégénérées : jamais une résolution', () => {
    for (const q of ['', '   ', null, undefined, 42, {}]) {
      expect(resolveSectionItem(YIA, q).ok, String(q)).toBe(false);
    }
    for (const s of [null, undefined, 'texte', {}, []]) {
      expect(resolveSectionItem(s, 'Sesame Seeds Grade A').ok, String(s)).toBe(false);
    }
  });

  it('une section sans items ne fausse pas la recherche', () => {
    const r = resolveSectionItem([{ name: 'Vide' }, ...YIA], 'Sesame Seeds Grade A');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sectionIndex).toBe(1);
  });
});

describe('CHANTIER 1 — destination d’un AJOUT : aucun repli arbitraire', () => {
  it('une seule section -> destination non ambiguë, sans la nommer', () => {
    const r = resolveTargetSection(YIA, undefined);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sectionName).toBe('Our Products');
  });

  it('🔴 plusieurs sections sans nom fourni -> REFUS, avec la liste', () => {
    const r = resolveTargetSection(DEUX_SECTIONS, undefined);
    expect(r).toMatchObject({ ok: false, reason: 'ambiguous' });
    if (!r.ok && r.reason === 'ambiguous') expect(r.sections).toEqual(['Produits', 'Services']);
  });

  it('nom fourni et unique -> cette section', () => {
    const r = resolveTargetSection(DEUX_SECTIONS, '  services ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sectionIndex).toBe(1);
  });

  it('nom fourni introuvable -> not_found, aucune section créée à la volée', () => {
    expect(resolveTargetSection(DEUX_SECTIONS, 'Inexistante')).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });

  it('🔴 AUCUNE section -> refus : rien n’est inventé', () => {
    expect(resolveTargetSection([], undefined).ok).toBe(false);
    expect(resolveTargetSection([], 'Nouvelle').ok).toBe(false);
  });

  it('deux sections homonymes -> ambiguïté, jamais « la première »', () => {
    const r = resolveTargetSection([{ name: 'Offres' }, { name: 'offres' }], 'Offres');
    expect(r).toMatchObject({ ok: false, reason: 'ambiguous' });
  });
});

describe('CHANTIER 1 — messages : ils nomment ce qui bloque', () => {
  it('introuvable : le titre est cité', () => {
    const r = resolveSectionItem(YIA, 'Cacao');
    if (!r.ok) expect(sectionItemMessage(r)).toContain('Cacao');
  });

  it('ambigu : les sections concernées sont citées, et l’absence d’écriture dite', () => {
    const r = resolveSectionItem(DEUX_SECTIONS, 'Commun');
    if (!r.ok) {
      const m = sectionItemMessage(r);
      expect(m).toContain('Produits');
      expect(m).toContain('Services');
      expect(m).toMatch(/aucune modification/i);
    }
  });

  it('destination ambiguë : la question posée est « laquelle »', () => {
    const r = resolveTargetSection(DEUX_SECTIONS, undefined);
    if (!r.ok) expect(sectionItemMessage(r)).toMatch(/Precisez laquelle/i);
  });

  it('une section anonyme reste désignable', () => {
    expect(sectionLabel({}, 2)).toBe('section 3');
    expect(sectionLabel({ name: '  ' }, 0)).toBe('section 1');
    expect(sectionLabel({ name: 'Offres' }, 0)).toBe('Offres');
  });
});
