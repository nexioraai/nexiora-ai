import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// DEBT-033 — LE CONTEXTE DE L'AGENT NE LIT QUE DES COLONNES QUI EXISTENT.
//
// LE DEFAUT MESURE. `CURRENT SITE STATE` valait
// `contact: { phone: site.phone, email: site.contact_email, address:
// site.address }`. `sites.phone` et `sites.contact_email` n'existent pas, et
// cette ligne en etait le SEUL lecteur du depot -- partout ailleurs (quatre
// themes, `llms.txt`, `JsonLd`, `aiScore`) la forme canonique est
// `site.contact.{phone,email}`.
//
// POURQUOI RIEN NE L'AVAIT SIGNALE, ET C'EST LE POINT. `site` est type `any`
// dans la route, donc TypeScript se tait. `JSON.stringify` ELIDE les cles
// `undefined`, donc rien n'echoue a l'execution. Et le test existant
// (`currentSiteState.test.ts`) verifie la PRESENCE des cles de premier
// niveau, jamais la RESOLUTION de leurs valeurs. Trois filets, trois mailles
// au meme endroit.
//
// CE FICHIER FERME LA CLASSE, PAS LE CAS. Il n'affirme pas « `contact` est
// bien la » : il evalue le litteral REEL avec un `site` instrumente, releve
// TOUTES les proprietes que le contexte lit, et les confronte au SCHEMA REEL.
// Un champ ajoute demain qui lirait une colonne inexistante echoue le jour ou
// il est ecrit, quel que soit son nom.
// ============================================================

const RACINE = join(__dirname, '../../../../../../..');
const CHAT = readFileSync(join(RACINE, 'src/app/api/agent/[slug]/chat/route.ts'), 'utf-8');

/**
 * LE SCHEMA REEL DE `sites`, reconstruit depuis le script de privileges — le
 * seul artefact du depot qui se declare « recalcule programmatiquement contre
 * le schema reel ». 41 colonnes editables + 18 protegees.
 *
 * Aucun acces base n'est disponible ici (ni `DATABASE_URL`, ni CLI Supabase
 * liee) : c'est la meilleure autorite atteignable, et elle est versionnee.
 */
function colonnesReelles(): Set<string> {
  const sql = readFileSync(
    join(RACINE, 'supabase/sql/lot_g_final_field_level_authorization.sql'), 'utf-8'
  );
  const grant = sql.match(/GRANT UPDATE \(([\s\S]*?)\) ON TABLE sites/);
  const protegees = sql.match(/forbidden_cols text\[\] := ARRAY\[([\s\S]*?)\];/);
  expect(grant, 'bloc GRANT UPDATE introuvable — extraction a revoir').toBeTruthy();
  expect(protegees, 'bloc forbidden_cols introuvable — extraction a revoir').toBeTruthy();
  const editables = grant![1].replace(/\n/g, ' ').split(',').map((c) => c.trim()).filter(Boolean);
  const bloquees = protegees![1].replace(/\n/g, ' ').split(',')
    .map((c) => c.trim().replace(/^'|'$/g, '')).filter(Boolean);
  return new Set([...editables, ...bloquees]);
}

/** Le litteral de CURRENT SITE STATE, commentaires retires. */
function sourceDuContexte(): string {
  const bloc = CHAT.match(/\$\{JSON\.stringify\(\n {2}\{[\s\S]*?\n {2}\},/);
  expect(bloc, 'CURRENT SITE STATE introuvable — extraction a revoir').toBeTruthy();
  return bloc![0]
    .replace(/^\$\{JSON\.stringify\(\n/, '')
    .replace(/,\s*$/, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

/** Evalue le litteral REEL avec un `site` qui note tout ce qu'on lui demande. */
function evaluer(donnees: Record<string, unknown>) {
  const lues = new Set<string>();
  const site = new Proxy(donnees, {
    get(cible, prop) {
      if (typeof prop === 'string') lues.add(prop);
      return (cible as Record<string, unknown>)[prop as string];
    },
    has: () => true,
  });
  const ctx = new Function('site', `return (${sourceDuContexte()});`)(site) as Record<string, unknown>;
  return { ctx, lues };
}

/** Un site Mode 1 reel, sous sa forme CANONIQUE — celle que /apply ecrit. */
const VITRINE = {
  name: 'Café du Coin', slogan: 'Le meilleur espresso', type: 'café',
  about: 'Depuis 1998', hero_title: 'Bienvenue', hero_subtitle: 'Ouvert 7j/7',
  primary_color: '#FA5D1E', theme: 'editorial', cta: 'Réserver',
  mode: 1, dropship_type: null,
  sections: [{ name: 'Nos offres', items: [{ title: 'Petit déjeuner' }] }],
  testimonials: [{ name: 'A', content: 'Super' }],
  faq: [{ question: 'Ouvert le dimanche ?', answer: 'Oui.' }],
  whyus: [{ title: 'Torréfaction locale', text: 'Chaque semaine.' }],
  area_served: 'Montréal', price_range: '$$',
  social_links: { instagram: 'https://instagram.com/x' },
  lang: 'fr', cj_margin_percent: null, address: '12 rue Principale',
  contact: { phone: '+1 514 555 0199', email: 'bonjour@cafeducoin.ca', address: '12 rue Principale' },
};

describe('DEBT-033 — 🔴 le contexte ne lit QUE des colonnes du schema reel', () => {
  const REEL = colonnesReelles();

  it('le denominateur est reel — sinon ce test ne prouverait rien', () => {
    expect(REEL.size, 'schema reconstruit').toBe(59);
    for (const t of ['contact', 'address', 'faq', 'sections', 'mode']) {
      expect(REEL, t).toContain(t);
    }
  });

  it('🔴 L’INVARIANT — aucune propriete lue n’est absente du schema', () => {
    const { lues } = evaluer(VITRINE);
    const fantomes = [...lues].filter((c) => !REEL.has(c)).sort();
    expect(
      fantomes,
      `le contexte lit des colonnes qui n'existent pas sur \`sites\` : ${fantomes.join(', ')}. ` +
      '`site` est type `any` (TypeScript se tait) et `JSON.stringify` élide les `undefined` ' +
      '(rien n’échoue à l’exécution) — seul ce test peut le voir.'
    ).toEqual([]);
  });

  it('le contexte lit reellement quelque chose — un Proxy muet passerait aussi', () => {
    const { lues } = evaluer(VITRINE);
    expect(lues.size).toBeGreaterThan(15);
  });
});

describe('DEBT-033 — le telephone et le courriel atteignent enfin le modele', () => {
  it('🔴 le JSON envoye a Anthropic contient les deux valeurs', () => {
    const { ctx } = evaluer(VITRINE);
    const json = JSON.stringify(ctx, null, 2);
    expect(json, 'le numéro doit être visible du modèle').toContain('+1 514 555 0199');
    expect(json, 'le courriel doit être visible du modèle').toContain('bonjour@cafeducoin.ca');
  });

  it('la forme exposee est celle que /apply ECRIT et que les themes RENDENT', () => {
    // `propose_contact_update` écrit `contact.{phone,email,address}` ; les
    // quatre thèmes font `const contact = site.contact || {}`. Le modèle doit
    // voir la même forme, sinon il adresse à l'aveugle ce qu'il modifie.
    const { ctx } = evaluer(VITRINE);
    expect(ctx.contact).toEqual(VITRINE.contact);
  });

  it('EXPOSE BRUT — aucune projection, comme sections/testimonials/faq/whyus', () => {
    const { ctx } = evaluer(VITRINE);
    for (const champ of ['sections', 'testimonials', 'faq', 'whyus', 'contact'] as const) {
      expect(ctx[champ], champ).toBe(VITRINE[champ]);
    }
  });

  it('un site sans `contact` ne fabrique aucune valeur', () => {
    // Fail-soft, jamais fail-invent : le modèle doit voir l'absence telle
    // quelle, pas un objet vide qui laisserait croire à une donnée effacée.
    const { ctx } = evaluer({ ...VITRINE, contact: undefined });
    expect(ctx.contact).toBeUndefined();
  });
});

describe('DEBT-033 — 🔒 CLIQUET : les deux noms fautifs ne peuvent pas revenir', () => {
  const code = CHAT.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

  it('`site.phone` et `site.contact_email` n’apparaissent plus dans le code', () => {
    expect(code, '`sites.phone` n’existe pas').not.toMatch(/\bsite\.phone\b/);
    expect(code, '`sites.contact_email` n’existe pas').not.toMatch(/\bsite\.contact_email\b/);
  });
});
