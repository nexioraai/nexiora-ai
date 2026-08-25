import { describe, it, expect } from 'vitest';
import {
  toolNamesForSite,
  UNIVERSAL_TOOLS,
  CONTENT_TOOLS,
  MANUAL_PRODUCT_TOOLS,
  CATALOG_TOOLS,
  PROMO_TOOLS,
  INVENTORY_TOOLS,
  PRODUCT_FIELD_TOOLS,
} from '../toolCapabilities';

// ============================================================
// ÉTAPE 3 — LES FAMILLES D'OUTILS DE L'AGENT.
//
// La règle vivait dans `agent/[slug]/chat/route.ts`, en trois `if (mode === N)`
// qui empilaient des familles. Un mode inconnu ne recevait `universal` que
// par ABSENCE de branche — correct par accident. Et les quatorze cliquets qui
// la surveillaient lisaient le texte source de la route, faute de pouvoir
// appeler une fonction non exportée.
//
// Ces tests appellent la règle réelle. Ils couvrent ce qu'aucun motif textuel
// ne pouvait exprimer : le comportement sur un mode qui n'existe pas encore.
// ============================================================

const TOUS_LES_MODES: unknown[] = [1, 2, 3, 4, 42, 0, -1, null, undefined, '1', '2', '3', NaN, true, {}];
const INCONNUS: unknown[] = [4, 42, 0, -1, null, undefined, '1', '2', '3', NaN, true, {}];

describe('ÉTAPE 3 — comportement métier conservé pour les modes 1, 2 et 3', () => {
  it('Mode 1 : universal + contenu + produits jsonb, et RIEN de commercial', () => {
    const t = toolNamesForSite(1, null);
    for (const n of [...UNIVERSAL_TOOLS, ...CONTENT_TOOLS, ...MANUAL_PRODUCT_TOOLS]) expect(t, n).toContain(n);
    for (const n of [...PROMO_TOOLS, ...INVENTORY_TOOLS, ...PRODUCT_FIELD_TOOLS, ...CATALOG_TOOLS]) {
      expect(t, n).not.toContain(n);
    }
  });

  it('Mode 2 : universal + contenu + promo + inventaire + champs produit ; PAS de jsonb, PAS de catalogue', () => {
    const t = toolNamesForSite(2, null);
    for (const n of [...UNIVERSAL_TOOLS, ...CONTENT_TOOLS, ...PROMO_TOOLS, ...INVENTORY_TOOLS, ...PRODUCT_FIELD_TOOLS]) {
      expect(t, n).toContain(n);
    }
    for (const n of [...MANUAL_PRODUCT_TOOLS, ...CATALOG_TOOLS]) expect(t, n).not.toContain(n);
  });

  it('Mode 3 : promo + inventaire + champs produit ; PAS de contenu, PAS de jsonb', () => {
    const t = toolNamesForSite(3, 'reseller');
    for (const n of [...UNIVERSAL_TOOLS, ...PROMO_TOOLS, ...INVENTORY_TOOLS, ...PRODUCT_FIELD_TOOLS]) {
      expect(t, n).toContain(n);
    }
    for (const n of [...CONTENT_TOOLS, ...MANUAL_PRODUCT_TOOLS]) expect(t, n).not.toContain(n);
  });
});

describe('ÉTAPE 3 — le catalogue : imbriqué dans le mode, jamais décidé par le sous-type seul', () => {
  it('mode 3 + reseller ou pod_custom -> outils catalogue', () => {
    for (const st of ['reseller', 'pod_custom']) {
      for (const n of CATALOG_TOOLS) expect(toolNamesForSite(3, st), `${st}/${n}`).toContain(n);
    }
  });

  it('mode 3 + pod_brand -> AUCUN outil catalogue (les produits viennent des designs)', () => {
    for (const n of CATALOG_TOOLS) expect(toolNamesForSite(3, 'pod_brand'), n).not.toContain(n);
  });

  it('🔴 le sous-type ne suffit JAMAIS : hors du mode 3, il n’ouvre rien', () => {
    for (const mode of INCONNUS.concat([1, 2])) {
      for (const st of ['reseller', 'pod_custom']) {
        for (const n of CATALOG_TOOLS) {
          expect(toolNamesForSite(mode, st), `mode ${String(mode)} / ${st}`).not.toContain(n);
        }
      }
    }
  });

  it('sous-type absent ou inconnu, même en mode 3 -> aucun catalogue', () => {
    for (const st of [null, undefined, '', 'inconnu', 3]) {
      for (const n of CATALOG_TOOLS) expect(toolNamesForSite(3, st), String(st)).not.toContain(n);
    }
  });
});

describe('ÉTAPE 3 — fail-closed sur tout mode inconnu', () => {
  it('un mode non inscrit ne reçoit QUE les outils universels', () => {
    for (const mode of INCONNUS) {
      expect(toolNamesForSite(mode, null).sort(), String(mode)).toEqual([...UNIVERSAL_TOOLS].sort());
    }
  });

  it('les chaînes ne sont jamais coercées : "2" n’est pas 2', () => {
    expect(toolNamesForSite('2', null)).not.toContain('count_product_stock');
    expect(toolNamesForSite('3', 'reseller')).not.toContain('catalog_curate');
  });

  it('les outils universels sont accordés à TOUS, sans exception', () => {
    for (const mode of TOUS_LES_MODES) {
      for (const n of UNIVERSAL_TOOLS) expect(toolNamesForSite(mode, null), `${String(mode)}/${n}`).toContain(n);
    }
  });
});

describe('ÉTAPE 3 — invariants de forme', () => {
  it('aucun doublon dans la liste rendue, quel que soit le mode', () => {
    for (const mode of TOUS_LES_MODES) {
      const t = toolNamesForSite(mode, 'reseller');
      expect(new Set(t).size, String(mode)).toBe(t.length);
    }
  });

  it('les familles ne se recouvrent pas', () => {
    const familles = [UNIVERSAL_TOOLS, CONTENT_TOOLS, MANUAL_PRODUCT_TOOLS, CATALOG_TOOLS, PROMO_TOOLS, INVENTORY_TOOLS, PRODUCT_FIELD_TOOLS];
    const tous = familles.flatMap((f) => [...f]);
    expect(new Set(tous).size).toBe(tous.length);
  });

  // CHANTIER 4 (MODE 1) — LE COMPTE AVANCE DE 26 À 32, ET LE CLIQUET RESTE.
  // Six outils ajoutés, tous dans `CONTENT_TOOLS` : `faq` et `whyus` sont du
  // contenu éditorial, au même titre que les témoignages. Le nombre est mis à
  // jour, jamais l'assertion supprimée — c'est elle qui oblige à justifier
  // chaque outil supplémentaire.
  // CHANTIER 7 — 32 → 33. Un seul outil : `propose_gallery_add`. Le cliquet
  // avance, il n'est pas supprimé — c'est lui qui oblige à justifier chaque
  // outil supplémentaire, un par un.
  it('33 outils au total — 26 du chantier catalogue, +6 faq/whyus, +1 ajout galerie', () => {
    const familles = [UNIVERSAL_TOOLS, CONTENT_TOOLS, MANUAL_PRODUCT_TOOLS, CATALOG_TOOLS, PROMO_TOOLS, INVENTORY_TOOLS, PRODUCT_FIELD_TOOLS];
    expect(familles.flatMap((f) => [...f])).toHaveLength(33);
  });

  it('la route ne décide plus : elle délègue', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(join(__dirname, '../../../app/api/agent/[slug]/chat/route.ts'), 'utf-8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('toolNamesForSite(mode, dropshipType)');
    expect(code).not.toMatch(/if \(mode === [0-9]\)/);
  });
});
