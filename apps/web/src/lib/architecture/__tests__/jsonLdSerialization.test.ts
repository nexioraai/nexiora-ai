import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ============================================================
// M1-05 -- GARDE STRUCTURELLE de la classe M1-01.
//
// Le test de rendu (themes/__tests__/jsonLdScript.test.tsx) prouve que
// `JsonLdScript` est sur. Il ne prouve PAS que tous les blocs JSON-LD du
// depot passent par lui -- un futur commit SEO/GEO pourrait reintroduire un
// `JSON.stringify` brut dans un `dangerouslySetInnerHTML` et rouvrir la
// faille sans faire echouer un seul test.
//
// C'est EXACTEMENT ainsi que les trois sinks d'origine sont apparus : trois
// commits successifs de donnees structurees (19fcbf0 JSON-LD, 37dccba FAQ,
// 669b87a geo/areaServed), aucun repasse en revue securite -- alors meme
// qu'un audit anterieur (SEC-09) avait deja traite la meme classe sur
// ProductModal.tsx et documente le rendu texte pur comme la bonne reponse.
//
// Cette garde ferme la boucle : composant sur PLUS preuve structurelle que
// tout le depot l'emprunte.
// ============================================================

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** Seul fichier autorise a passer du JSON serialise a un innerHTML. */
const OWNER = 'src/app/sites/[slug]/themes/JsonLdScript.tsx';

/** `renderBold` (OnboardingChat) echappe &, < et > AVANT d'inserer le <strong> :
 *  il ne serialise aucun JSON et sort du perimetre de cette garde. Verifie
 *  pendant l'audit MODE 1, conserve ici comme exception nommee et non comme
 *  trou silencieux -- si ce fichier se met un jour a serialiser du JSON, la
 *  seconde assertion ci-dessous le detectera. */
const KNOWN_NON_JSON_SINKS = ['src/components/onboarding/OnboardingChat.tsx'];

/** Le motif REELLEMENT dangereux : du JSON serialise passe directement dans
 *  l'objet `{ __html: ... }` du sink. C'est la forme exacte des 3 sinks
 *  d'origine. */
const DANGEROUS_SINK = /dangerouslySetInnerHTML\s*=\s*\{\{[^}]*JSON\.stringify/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Retire commentaires de ligne et de bloc : une mention de
 *  `dangerouslySetInnerHTML` dans une explication n'est pas un sink. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const FILES = walk(SRC).filter((f) => !f.includes('__tests__'));

describe('M1-01 — garde structurelle : la sérialisation JSON-LD reste centralisée', () => {
  it('le dénominateur est non vide (sinon la garde ne prouverait rien)', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('CONTRÔLE POSITIF — le détecteur reconnaît le motif d’origine', () => {
    // Forme exacte des 3 sinks avant correctif. Si cette assertion tombe, le
    // detecteur ne detecte plus rien et la garde serait verte a tort.
    expect(
      DANGEROUS_SINK.test('dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}')
    ).toBe(true);
    // Et il ne doit PAS confondre un sink deja echappe avec le motif dangereux.
    expect(
      DANGEROUS_SINK.test('dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}')
    ).toBe(false);
  });

  it('AUCUN fichier hors JsonLdScript ne passe du JSON à dangerouslySetInnerHTML', () => {
    const violations: string[] = [];

    for (const file of FILES) {
      const rel = relative(ROOT, file);
      if (rel === OWNER) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      if (!code.includes('dangerouslySetInnerHTML')) continue;

      // Un sink existe. Serialise-t-il du JSON DANS CE SINK ?
      // La detection porte sur l'EXPRESSION du sink, pas sur la presence des
      // deux motifs quelque part dans le fichier : OnboardingChat.tsx appelle
      // JSON.stringify pour un corps de requete, sans aucun rapport avec son
      // innerHTML. Un test de portee trop large aurait signale un fichier sur
      // lequel il n'y a rien a corriger -- et la tentation aurait ete
      // d'assouplir la garde plutot que d'affiner la detection.
      if (DANGEROUS_SINK.test(code)) {
        violations.push(
          `${rel} — dangerouslySetInnerHTML + JSON.stringify. ` +
            `Utiliser <JsonLdScript data={...} /> : JSON.stringify n'échappe ni « < » ni « / », ` +
            `une valeur marchande peut donc fermer le <script> et exécuter du code sur l'origine de la plateforme (M1-01).`
        );
        continue;
      }

      // Sink sans JSON : toléré uniquement s'il est explicitement recensé.
      if (!KNOWN_NON_JSON_SINKS.includes(rel)) {
        violations.push(
          `${rel} — nouveau dangerouslySetInnerHTML non recensé. ` +
            `Prouver qu'il échappe son entrée, puis l'ajouter à KNOWN_NON_JSON_SINKS avec la preuve.`
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it('les 3 sinks JSON-LD d’origine passent bien par le composant', () => {
    const consumers = [
      'src/app/sites/[slug]/themes/JsonLd.tsx',
      'src/app/sites/[slug]/produits/[id]/page.tsx',
    ];
    for (const rel of consumers) {
      const code = readFileSync(join(ROOT, rel), 'utf8');
      expect(code, `${rel} doit importer JsonLdScript`).toContain('JsonLdScript');
      expect(stripComments(code), `${rel} ne doit plus sérialiser lui-même`).not.toContain(
        'dangerouslySetInnerHTML'
      );
    }
  });

  it('le composant propriétaire échappe réellement (et n’est pas une coquille vide)', () => {
    const code = readFileSync(join(ROOT, OWNER), 'utf8');
    expect(code).toContain('\\\\u003c');
    expect(code).toMatch(/replace\(/);
  });
});
