import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  VALID_FORMATS,
  buildBriefPrompt,
  buildContentPrompt,
  parseJson,
} from '@/lib/marketing/prompts';
import { AREA_SERVED_MAX_LENGTH } from '@/lib/site-profile/areaServed';

// ============================================================
// LOT BLOG 2 -- LE MOTEUR DE PROMPTS EXTRAIT.
//
// CE QUE CE FICHIER PROTEGE, ET POURQUOI IL EXISTE. L'extraction n'a qu'un
// but : que la route blog (lot 4) reutilise le generateur d'article SANS
// dupliquer un seul prompt. Une extraction qui laisserait une copie derriere
// elle, ou qu'une passe ulterieure recopierait ailleurs, aurait donc echoue
// meme si tous les tests de comportement passaient. Le cliquet du bas mesure
// exactement cela.
//
// CE FICHIER VIT DANS `src/lib/__tests__/` ET NON DANS
// `src/lib/marketing/__tests__/` : `src/lib/marketing/**` N'EST PAS dans
// l'`include` de vitest.config.ts. Un test place la passerait en isolation
// (`vitest run <fichier>`) mais ne serait JAMAIS collecte par `vitest run` --
// silencieusement, sans erreur ni avertissement. C'est le piege documente
// six fois dans vitest.config.ts. Meme choix que `src/lib/mode3/`, teste
// depuis `src/lib/__tests__/catalog-stock.test.ts`.
// ============================================================

const SITE = {
  name: 'YIA Global Commodities',
  slogan: 'Import export',
  type: 'import export',
  about: 'Négoce de matières premières',
  services: ['fret'],
  products: [],
  mission: 'Relier les marchés',
  vision: 'Devenir la référence',
  area_served: "N'Djamena, Tchad",
};

describe('parseJson — comportement inchangé', () => {
  it('retire les clôtures markdown ```json et parse', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('retire aussi les clôtures nues ``` et les espaces autour', () => {
    expect(parseJson('  ```\n{"b":"x"}\n```  ')).toEqual({ b: 'x' });
  });

  it('accepte du JSON sans aucune clôture', () => {
    expect(parseJson('{"c":true}')).toEqual({ c: true });
  });

  it('lève sur du JSON invalide — aucun repli silencieux', () => {
    expect(() => parseJson('pas du json')).toThrow();
  });
});

describe('VALID_FORMATS — source unique de l’énumération', () => {
  it('porte exactement les trois formats', () => {
    expect([...VALID_FORMATS]).toEqual(['article', 'social', 'email']);
  });

  it('la route l’importe au lieu de la redéclarer', () => {
    const route = readFileSync(
      join(__dirname, '../../app/api/marketing/generate/route.ts'),
      'utf-8'
    );
    expect(route).toMatch(/import \{[^}]*VALID_FORMATS[^}]*\}/);
    expect(route).not.toMatch(/^const VALID_FORMATS/m);
    expect(route).not.toMatch(/^type Format =/m);
  });
});

describe('buildBriefPrompt — pur, et toujours protégé par la porte de prompt', () => {
  it('interpole les données réelles du business', () => {
    const p = buildBriefPrompt(SITE);
    expect(p).toContain('YIA Global Commodities');
    expect(p).toContain('Négoce de matières premières');
    expect(p).toContain('mots_cles_seo');
  });

  it('déterministe : deux appels identiques rendent la même chaîne', () => {
    expect(buildBriefPrompt(SITE)).toBe(buildBriefPrompt(SITE));
  });

  it('CHANTIER 5 — `area_served` passe TOUJOURS par sanitizeAreaServedForPrompt', () => {
    // La borne doit rester active APRÈS l'extraction : c'est la garde posée
    // au point d'entrée pour couvrir aussi les valeurs déjà en base.
    const injection = 'x'.repeat(AREA_SERVED_MAX_LENGTH + 500);
    const p = buildBriefPrompt({ ...SITE, area_served: injection });
    expect(p).not.toContain(injection);
    expect(p.length).toBeLessThan(buildBriefPrompt(SITE).length + injection.length);
  });

  it('tolère un site vide sans lever — comportement d’origine', () => {
    expect(() => buildBriefPrompt({})).not.toThrow();
  });
});

describe('buildContentPrompt — les trois formats, inchangés', () => {
  const brief = { ton: 'expert', positionnement: 'premium' };

  it('article : structure SEO attendue', () => {
    const p = buildContentPrompt(SITE, brief, 'article');
    expect(p).toContain('FORMAT : Article de blog SEO.');
    expect(p).toContain('meta_description');
    expect(p).toContain('"contenu"');
  });

  it('social : les trois plateformes', () => {
    const p = buildContentPrompt(SITE, brief, 'social');
    expect(p).toContain('instagram');
    expect(p).toContain('linkedin');
    expect(p).toContain('facebook');
  });

  it('email : objet, préheader, corps, CTA', () => {
    const p = buildContentPrompt(SITE, brief, 'email');
    expect(p).toContain('"objet"');
    expect(p).toContain('"preheader"');
    expect(p).toContain('"bouton_cta"');
  });

  it('CHANTIER 5 — la porte de prompt couvre aussi ce prompt', () => {
    const injection = 'y'.repeat(AREA_SERVED_MAX_LENGTH + 500);
    const p = buildContentPrompt({ ...SITE, area_served: injection }, brief, 'article');
    expect(p).not.toContain(injection);
  });
});

// ============================================================
// CLIQUET STRUCTUREL -- LA RAISON D'ETRE DU LOT.
// ============================================================
describe('cliquet structurel', () => {
  const RACINE = join(__dirname, '../..');
  const SRC = readFileSync(join(RACINE, 'lib/marketing/prompts.ts'), 'utf-8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  function fichiers(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const f = join(dir, e);
      if (statSync(f).isDirectory()) fichiers(f, acc);
      else if (/\.tsx?$/.test(e)) acc.push(f);
    }
    return acc;
  }

  it('AUCUN prompt n’est dupliqué ailleurs — c’est tout l’objet de l’extraction', () => {
    // Deux phrases d'ouverture, propres à chacun des deux prompts. Si l'une
    // réapparaît dans un second fichier, une copie a été faite : le lot 4
    // devra importer ce module, jamais recopier ses chaînes.
    const EMPREINTES = [
      'Tu es un stratège marketing senior',
      'Tu es un copywriter premium',
    ];
    for (const empreinte of EMPREINTES) {
      const porteurs = fichiers(RACINE)
        .filter((f) => !f.includes('__tests__'))
        .filter((f) => readFileSync(f, 'utf-8').includes(empreinte));
      expect(porteurs.map((f) => f.replace(RACINE, 'src')), empreinte).toEqual([
        'src/lib/marketing/prompts.ts',
      ]);
    }
  });

  it('le module reste PUR — aucune E/S, aucun secret, aucune authentification', () => {
    // C'est cette pureté qui rend le module importable depuis la route
    // marketing ET depuis la future route blog, sans effet de bord.
    expect(CODE).not.toMatch(/fetch\(|supabase|process\.env|Anthropic|NextResponse/);
    expect(CODE).not.toMatch(/\brequire[A-Z]\w*\(/);
    expect(CODE).not.toMatch(/\basync\b|\bawait\b/);
  });

  it('`sanitizeAreaServedForPrompt` n’a PAS été déplacée — elle reste son autorité unique', () => {
    const areaServed = join(RACINE, 'lib/site-profile/areaServed.ts');
    expect(readFileSync(areaServed, 'utf-8')).toMatch(
      /export function sanitizeAreaServedForPrompt/
    );
    // Elle est importée depuis son emplacement d'origine, pas recopiée.
    expect(CODE).toContain("from '@/lib/site-profile/areaServed'");
    expect(CODE).not.toMatch(/function sanitizeAreaServedForPrompt/);
  });

  it('les TROIS points d’entrée du CHANTIER 5 restent couverts', () => {
    // 1 et 2 : les deux prompts texte, désormais ici.
    expect((CODE.match(/sanitizeAreaServedForPrompt\(/g) ?? []).length).toBe(2);
    // 3 : le prompt image, resté dans la route parce qu'il fait du réseau.
    const route = readFileSync(
      join(RACINE, 'app/api/marketing/generate/route.ts'),
      'utf-8'
    );
    expect(route).toContain("import { sanitizeAreaServedForPrompt } from '@/lib/site-profile/areaServed'");
    expect(route).toContain('const zonePrompt = sanitizeAreaServedForPrompt(site.area_served)');
  });
});
