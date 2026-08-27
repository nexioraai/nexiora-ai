import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import type { NextRequest } from 'next/server';
import { join } from 'path';

// ============================================================
// FERMETURE MODE 1, VOLET 2 — UNE VITRINE N'A NI BANNIERE NI CODE PROMO
// (DEBT-031).
//
// LE DEFAUT MESURE. `PromoBanner` etait monte SANS CONDITION DE MODE sur
// DEUX pages (`sites/[slug]/page.tsx` et `preview/[slug]/page.tsx`), en FRERE
// de `CartShell` — il n'heritait donc rien de la garde de ce dernier. Les
// deux routes qu'il alimente sont PUBLIQUES et NON AUTHENTIFIEES et ne
// lisaient pas le mode : elles ne faisaient `select('id')` sur `sites`.
//
// CE QUI LES PROTEGEAIT, ET POURQUOI CE N'ETAIT PAS UNE FRONTIERE. Apres le
// volet 1, plus aucun chemin applicatif ne cree de code promo pour une
// vitrine. La protection etait donc l'ABSENCE d'ecriture en amont — une
// defense accidentelle qui se rouvrirait au premier chemin ajoute, et qui ne
// dit rien du vecteur PostgREST direct sur `promo_codes`, a ce jour non
// prouve. Une capacite se ferme la ou elle devient possible : ici, la route.
//
// CE FICHIER COUVRE LA CHAINE ENTIERE : rendu (les deux points de montage),
// API (les deux routes), et l'ecriture que l'une d'elles declenche.
// ============================================================

const fromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: (t: string) => fromMock(t) } }));
const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

type Result = { data?: unknown; error?: unknown; count?: number };

/** Tables REELLEMENT interrogees, dans l'ordre — le coeur de la preuve. */
let touchees: string[] = [];

/** Le maillon fluent minimal que les deux routes appellent reellement. */
type Maillon = Record<string, unknown>;

function chain(result: Result) {
  const c: Maillon = {};
  const self = () => c;
  c.select = vi.fn(self); c.eq = vi.fn(self); c.gte = vi.fn(self);
  c.order = vi.fn(self); c.limit = vi.fn(self);
  c.single = vi.fn(() => Promise.resolve(result));
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.then = (r: (v: Result) => void) => r(result);
  return c;
}

const PROMO = {
  data: { id: 'p1', code: 'ETE20', discount_type: 'percent', discount_value: 20,
          min_order: 0, max_uses: null, used_count: 0, expires_at: null },
  error: null,
};

/** Monte un site de `mode` donne ; le code promo existe TOUJOURS en base. */
function setup(mode: unknown) {
  const tables: Record<string, Result> = {
    sites: { data: { id: 'site-1', mode }, error: null },
    promo_codes: PROMO,
    checkout_anomalies: { count: 0, data: null, error: null },
  };
  fromMock.mockImplementation((table: string) => {
    touchees.push(table);
    return chain(tables[table] ?? { data: null, error: null });
  });
}

beforeEach(() => { touchees = []; fromMock.mockReset(); logAnomalyMock.mockReset(); });

// `as unknown as NextRequest` plutot que `as any` : les deux routes ne lisent
// qu'un seul champ chacune (`nextUrl.searchParams` / `json()`), et le double
// cast le dit — un `any` masquerait qu'on ne fournit qu'une facade.
const getActive = async () => {
  const { GET } = await import('../active/route');
  const faux = { nextUrl: { searchParams: new URLSearchParams('slug=x') } };
  const res = await GET(faux as unknown as NextRequest);
  return { statut: res.status, corps: await res.json() };
};
const postValidate = async () => {
  const { POST } = await import('../validate/route');
  const faux = { json: async () => ({ slug: 'x', code: 'ETE20', subtotal: 100 }) };
  const res = await POST(faux as unknown as NextRequest);
  return { statut: res.status, corps: await res.json() };
};

// ------------------------------------------------------------
// J — LES VALEURS. Le denominateur est explicite, pas suppose.
// ------------------------------------------------------------
const ADMIS: Array<[string, unknown]> = [['Mode 2', 2], ['Mode 3', 3]];
const REFUSES: Array<[string, unknown]> = [
  ['Mode 1 (vitrine)', 1],
  ['undefined', undefined],
  ['null', null],
  ['zero', 0],
  ['mode inconnu 4', 4],
  ['chaine "2"', '2'],
  ['chaine "3"', '3'],
  ['NaN', NaN],
  ['objet', {}],
];

describe('DEBT-031 — GET /promo/active : la frontiere est DANS la route', () => {
  for (const [nom, mode] of REFUSES) {
    it(`🔴 ${nom} : aucun code promo servi, et \`promo_codes\` JAMAIS interrogee`, async () => {
      setup(mode);
      const { statut, corps } = await getActive();
      expect(statut, nom).toBe(200);
      expect(corps, nom).toEqual({ promo: null });
      // La preuve n'est pas la reponse — c'est que la table n'a pas ete lue.
      // Un simple `promo: null` pourrait venir d'un code absent ; ceci non.
      expect(touchees, nom).toEqual(['sites']);
    });
  }

  for (const [nom, mode] of ADMIS) {
    it(`${nom} : le code promo est servi (controle positif)`, async () => {
      setup(mode);
      const { corps } = await getActive();
      expect((corps as { promo: { code: string } }).promo.code, nom).toBe('ETE20');
      expect(touchees, nom).toEqual(['sites', 'promo_codes']);
    });
  }
});

describe('DEBT-031 — POST /promo/validate : le refus PRECEDE l’ecriture', () => {
  for (const [nom, mode] of REFUSES) {
    it(`🔴 ${nom} : invalide, aucune lecture de code, AUCUNE anomalie ecrite`, async () => {
      setup(mode);
      const { statut, corps } = await postValidate();
      expect(statut, nom).toBe(200);
      expect(corps, nom).toEqual({ valid: false, reason: 'invalid' });
      expect(touchees, nom).toEqual(['sites']);
      // Cette route N'EST PAS en lecture seule : le chemin « code
      // introuvable » ecrit dans `checkout_anomalies` (DEBT-028). Sans la
      // garde, une vitrine offrait a un appelant ANONYME un moyen de faire
      // grossir cette table sur son propre `site_id`.
      expect(logAnomalyMock, nom).not.toHaveBeenCalled();
    });
  }

  for (const [nom, mode] of ADMIS) {
    it(`${nom} : la remise est calculee (controle positif)`, async () => {
      setup(mode);
      const { corps } = await postValidate();
      expect(corps, nom).toMatchObject({ valid: true, code: 'ETE20', discount: 20 });
      expect(touchees, nom).toContain('promo_codes');
    });
  }
});

// ------------------------------------------------------------
// LE RENDU. `environment: 'node'` — `useEffect` ne s'execute pas sous
// `renderToStaticMarkup`, l'appel reseau n'est donc pas observable. On verifie
// donc la STRUCTURE, et on la verifie la ou le defaut est reellement ne : la
// derive entre points de montage.
// ------------------------------------------------------------
const SRC = join(__dirname, '../../../../..');

function tousLesFichiers(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === '__tests__' || e === 'node_modules') continue;
      out.push(...tousLesFichiers(p));
    } else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

describe('🔒 CLIQUET — TOUT point de montage de PromoBanner passe `mode`', () => {
  const montages = tousLesFichiers(SRC)
    .map((f) => ({ f, src: readFileSync(f, 'utf-8') }))
    .flatMap(({ f, src }) =>
      [...src.matchAll(/<PromoBanner\b[^>]*\/>/g)].map((m) => ({ f, balise: m[0] }))
    );

  it('il en existe reellement — un ensemble vide passerait aussi', () => {
    // LE DEFAUT VENAIT DE LA : deux points de montage, tous deux ayant oublie
    // la garde, chacun ignorant l'autre. Ce cliquet est indexe sur le DISQUE :
    // un troisieme montage ajoute demain entre dans le denominateur parce
    // qu'il existe, et echoue tant qu'il ne passe pas `mode`.
    expect(montages.length).toBeGreaterThanOrEqual(2);
  });

  for (const { f, balise } of montages) {
    it(`${f.split('/src/')[1]} passe \`mode\``, () => {
      expect(balise).toMatch(/\bmode=\{/);
    });
  }
});

describe('🔒 CLIQUET — la garde de PromoBanner precede l’appel reseau', () => {
  const BANNER = readFileSync(join(SRC, 'app/sites/[slug]/themes/PromoBanner.tsx'), 'utf-8');
  const code = BANNER.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

  it('l’autorite est `canTransact`, jamais une comparaison de mode ecrite ici', () => {
    expect(code).toContain("from '@/lib/commerce-admission/canTransact'");
    expect(code, 'aucune regle de mode ne doit etre redefinie dans ce composant')
      .not.toMatch(/\bmode\b\s*\)?\s*(?:[=!]==?|[<>]=?)\s*-?\d/);
  });

  it('🔴 le refus sort AVANT le fetch, pas apres', () => {
    const garde = code.indexOf('if (!admis) return;');
    const appel = code.indexOf('fetch(');
    expect(garde, 'garde absente').toBeGreaterThan(-1);
    expect(appel, 'fetch absent').toBeGreaterThan(-1);
    // Une vitrine n'interroge JAMAIS une route commerciale, meme pour
    // s'entendre repondre « rien » : le cout reseau et la trace serveur
    // existent aussi quand la reponse est vide.
    expect(garde).toBeLessThan(appel);
  });

  it('`mode` est un prop REQUIS — un optionnel se serait taire au lieu d’echouer', () => {
    expect(code).toMatch(/mode:\s*number\s*\|\s*null\s*\|\s*undefined/);
    expect(code, '`mode?:` rendrait les points de montage libres de l’omettre')
      .not.toMatch(/mode\?\s*:/);
  });
});
