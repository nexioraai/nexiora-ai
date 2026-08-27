import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { guidanceForSite } from '../modeGuidance';

// ============================================================
// ÉTAPE 4 — CHAQUE AGENT NE LIT QUE SA PROPRE GUIDANCE.
//
// LE DÉFAUT, PROUVÉ À L'EXÉCUTION (Node, pas lecture). Les cinq branches
// vivaient dans le template `systemPrompt` sous la forme
// `\${site.mode === 1 ? \`…\` : ''}` — dollar et backticks ÉCHAPPÉS. Dans un
// template littéral, `\${` produit la chaîne `${` : les branches n'étaient
// JAMAIS évaluées. Un agent de site vitrine recevait les cinq guidances, plus
// la syntaxe JavaScript — 5 312 caractères sur 14 780, soit 36 % du prompt,
// dont 6 lignes utiles sur 49.
//
// CE N'ÉTAIT PAS UNE INTENTION : les quatre autres interpolations du même
// template fonctionnaient toutes. Erreur d'échappement isolée.
//
// CES TESTS PORTENT SUR LA FONCTION RÉELLEMENT INTERPOLÉE par la route, et
// sur le texte source pour ce que la fonction seule ne peut pas prouver
// (l'absence d'échappement résiduel).
// ============================================================

const ROUTE = readFileSync(
  join(__dirname, '../../../app/api/agent/[slug]/chat/route.ts'),
  'utf-8'
);

const TITRES = {
  1: 'MODE: SHOWCASE / VITRINE (mode 1)',
  2: 'MODE: LOCAL BOUTIQUE (mode 2)',
  reseller: 'MODE: DROPSHIPPING RESELLER (mode 3, reseller)',
  pod_brand: 'MODE: PRINT-ON-DEMAND BRAND (mode 3, pod_brand)',
  pod_custom: 'MODE: PRINT-ON-DEMAND CUSTOM (mode 3, pod_custom)',
} as const;
const TOUS = Object.values(TITRES);

/** Le bloc attendu est présent, et AUCUN des quatre autres. */
function seul(g: string, attendu: string) {
  expect(g, `bloc attendu absent : ${attendu}`).toContain(attendu);
  for (const autre of TOUS) {
    if (autre === attendu) continue;
    expect(g, `fuite vers un autre mode : ${autre}`).not.toContain(autre);
  }
}

describe('ÉTAPE 4 — les cinq cas, un bloc chacun et rien d’autre', () => {
  it('mode 1 -> SHOWCASE / VITRINE, seul', () => {
    seul(guidanceForSite(1, null), TITRES[1]);
  });

  it('mode 2 -> LOCAL BOUTIQUE, seul', () => {
    seul(guidanceForSite(2, null), TITRES[2]);
  });

  it('mode 3 + reseller -> DROPSHIPPING RESELLER, seul', () => {
    seul(guidanceForSite(3, 'reseller'), TITRES.reseller);
  });

  it('mode 3 + pod_brand -> POD BRAND, seul', () => {
    seul(guidanceForSite(3, 'pod_brand'), TITRES.pod_brand);
  });

  it('mode 3 + pod_custom -> POD CUSTOM, seul', () => {
    seul(guidanceForSite(3, 'pod_custom'), TITRES.pod_custom);
  });
});

describe('ÉTAPE 4 — le sous-type ne décide jamais hors du mode 3', () => {
  it('un sous-type fournisseur sur un mode 1 ou 2 ne change RIEN', () => {
    for (const st of ['reseller', 'pod_brand', 'pod_custom']) {
      seul(guidanceForSite(1, st), TITRES[1]);
      seul(guidanceForSite(2, st), TITRES[2]);
    }
  });

  it('mode 3 sans sous-type ou avec un sous-type inconnu -> AUCUNE guidance', () => {
    for (const st of [null, undefined, '', 'inconnu', 3, {}]) {
      expect(guidanceForSite(3, st), String(st)).toBe('');
    }
  });
});

describe('ÉTAPE 4 — fail-closed : jamais la guidance d’un autre', () => {
  it('un mode inconnu ne reçoit AUCUNE guidance spécifique', () => {
    for (const m of [4, 5, 42, 0, -1, null, undefined, NaN, true, {}]) {
      expect(guidanceForSite(m, null), String(m)).toBe('');
      expect(guidanceForSite(m, 'reseller'), String(m)).toBe('');
    }
  });

  it('les chaînes ne sont jamais coercées : "1", "2", "3" ne donnent rien', () => {
    for (const m of ['1', '2', '3']) expect(guidanceForSite(m, 'reseller'), m).toBe('');
  });

  it('une guidance vide n’est jamais une chaîne « undefined » ou « null »', () => {
    expect(guidanceForSite(4, null)).toBe('');
    expect(guidanceForSite(4, null)).not.toContain('undefined');
  });
});

describe('ÉTAPE 4 — le prompt de la route est réellement corrigé', () => {
  it('la route INTERPOLE la guidance, et l’interpolation est VIVANTE', () => {
    expect(ROUTE).toContain('${guidanceForSite(site.mode, site.dropship_type)}');
    expect(ROUTE).not.toContain('\\${guidanceForSite');
  });

  it('🔴 plus AUCUN `\\${` échappé ne subsiste dans le system prompt', () => {
    const i = ROUTE.indexOf('const systemPrompt = `');
    expect(i).toBeGreaterThan(-1);
    const prompt = ROUTE.slice(i, i + 12000);
    expect(prompt.match(/\\\$\{/g) ?? [], 'une interpolation est de nouveau échappée').toEqual([]);
  });

  it('les quatre interpolations d’origine sont intactes', () => {
    for (const v of ['${site.name}', '${slug}', '${ownerEmail}', '${JSON.stringify(']) {
      expect(ROUTE, v).toContain(v);
    }
  });

  it('les deux fences Markdown restent ÉCHAPPÉES — elles, c’est voulu', () => {
    const i = ROUTE.indexOf('const systemPrompt = `');
    expect(ROUTE.slice(i, i + 12000).split('\\`\\`\\`').length - 1).toBe(2);
  });

  it('les cinq titres ont bien QUITTÉ la route pour la primitive', () => {
    for (const t of TOUS) expect(ROUTE, t).not.toContain(t);
  });
});
