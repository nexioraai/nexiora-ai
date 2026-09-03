import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  toolNamesForSite,
  COMMERCIAL_ARTIFACT_TOOLS,
  UNIVERSAL_TOOLS, CONTENT_TOOLS, MANUAL_PRODUCT_TOOLS,
  CATALOG_TOOLS, PROMO_TOOLS, INVENTORY_TOOLS, PRODUCT_FIELD_TOOLS,
} from '../toolCapabilities';
import { canTransact, TRANSACTING_SITE_MODES } from '@/lib/commerce-admission/canTransact';

// ============================================================
// DEBT-032 — LES TROIS ALLOWLISTS D'OUTILS NE PEUVENT PLUS DIVERGER EN
// SILENCE, ET AUCUNE CAPACITE COMMERCIALE NE PEUT ATTEINDRE LE MODE 1.
//
// TROIS ENSEMBLES, PAS DEUX — c'est la premiere chose que la mesure a
// corrigee. Le meme nom d'outil doit exister a trois endroits qui s'ignorent :
//
//   D  DECLARATION   `allTools` (agent/[slug]/chat/route.ts)
//                    les schemas que le modele peut se voir presenter
//   C  CAPACITE      les sept familles (toolCapabilities.ts)
//                    ce qu'un mode a le droit de recevoir
//   A  APPLICATION   `ALLOWED_TOOLS` (agent/[slug]/apply/route.ts)
//                    ce que la route veut bien executer
//
// CHAQUE DIFFERENCE A UN MODE DE PANNE PROPRE, et aucun ne leve d'erreur :
//   C \ D  accordable mais jamais declare -> CAPACITE FANTOME. `getToolsForSite`
//          filtre `allTools` : le mode « possede » un outil que le modele ne
//          voit jamais. L'octroi est mort.
//   D \ C  declare mais accordable a aucun mode -> SCHEMA MORT. Il coute des
//          jetons de prompt a chaque requete et ne peut jamais etre propose.
//   C \ A  proposable mais `/apply` refuserait en 400 -> PROMESSE FAUSSE. Le
//          modele propose, le marchand approuve, la route dit non.
//   A \ C  execute par `/apply` sans qu'aucun mode le gouverne -> C'EST
//          EXACTEMENT LA FORME DE DEBT-030. Depuis le volet 1 la garde le
//          refuse, donc c'est une surface d'acceptation MORTE -- et une
//          surface morte dans une allowlist est precisement ce qui a permis
//          a DEBT-030 de naitre.
//
// LA PROPRIETE ARCHITECTURALE, celle qui n'existait nulle part :
//
//     un mode qui recoit UN SEUL outil produisant un artefact commercial
//     DOIT etre admis par `canTransact`.
//
// `toolCapabilities` disait « quel mode recoit quel outil » ; `canTransact`
// disait « quel mode a le droit de commercer ». Les deux autorites
// coexistaient SANS RELATION EXPRIMEE : inscrire le mode 1 dans `PROMO_MODES`
// n'aurait fait rougir aucun test.
//
// CE FICHIER NE CREE PAS UNE SECONDE SOURCE DE VERITE. Il n'enumere aucune
// association mode -> outil : il APPELLE `toolNamesForSite` et `canTransact`,
// les deux autorites reelles, et verifie la relation entre leurs reponses.
// La seule chose qu'il declare -- la nature d'un outil -- vit dans
// `toolCapabilities.ts` et n'est enoncee nulle part ailleurs dans le depot.
// ============================================================

const RACINE = join(__dirname, '../../../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');

/** Commentaires retires : un nom cite en prose n'est pas une declaration. */
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

// ------------------------------------------------------------
// EXTRACTION DE A ET D DEPUIS LA SOURCE.
//
// Ces deux ensembles sont des litteraux internes a leurs routes, non exportes
// et non invocables sans mocker tout le SDK Anthropic -- meme methodologie que
// `currentSiteState.test.ts` et `inventoryToolExposure.test.ts`.
//
// TOUTE EXTRACTION EST VALIDEE AVANT USAGE, et ce n'est pas une precaution de
// style : pendant l'audit qui a produit ce fichier, une premiere regex a
// silencieusement rate 5 outils sur 33 et fabrique un faux defaut. Une regex
// qui ne matche rien rendrait ces tests VIDES DONC VERTS. Le denominateur est
// donc verifie a chaque fois.
// ------------------------------------------------------------
function extraireA(): Set<string> {
  const src = lire('src/app/api/agent/[slug]/apply/route.ts');
  const bloc = src.match(/const ALLOWED_TOOLS = new Set\(\[([\s\S]*?)\]\);/);
  expect(bloc, 'ALLOWED_TOOLS introuvable dans /apply — extraction a revoir').toBeTruthy();
  return new Set(
    [...sansCommentaires(bloc![1]).matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  );
}

function extraireD(): Set<string> {
  const src = lire('src/app/api/agent/[slug]/chat/route.ts');
  const bloc = src.match(/const allTools\b[^=]*=\s*\[([\s\S]*?)\n\];/);
  expect(bloc, 'allTools introuvable dans /chat — extraction a revoir').toBeTruthy();
  return new Set(
    [...sansCommentaires(bloc![1]).matchAll(/name:\s*'([a-z_]+)'\s*,\s*description:/g)].map((m) => m[1])
  );
}

const FAMILLES: Record<string, readonly string[]> = {
  UNIVERSAL_TOOLS, CONTENT_TOOLS, MANUAL_PRODUCT_TOOLS,
  CATALOG_TOOLS, PROMO_TOOLS, INVENTORY_TOOLS, PRODUCT_FIELD_TOOLS,
};

const A = extraireA();
const D = extraireD();
const C = new Set(Object.values(FAMILLES).flat());
const COMMERCIAUX = new Set<string>(COMMERCIAL_ARTIFACT_TOOLS);

/** Tous les couples (mode, sous-type) qu'un site peut reellement porter, plus l'invalide. */
const SOUS_TYPES: unknown[] = [null, undefined, 'reseller', 'pod_brand', 'pod_custom', 'inconnu'];
const MODES_REELS: unknown[] = [1, 2, 3];
const MODES_INVALIDES: unknown[] = [undefined, null, 0, 4, 99, '1', '2', '3', NaN, {}, [], true];

const diff = (x: Set<string>, y: Set<string>) => [...x].filter((v) => !y.has(v)).sort();

// ------------------------------------------------------------
describe('DEBT-032 — le denominateur est REEL (sans quoi tout le reste est vide donc vert)', () => {
  it('les trois extractions ont trouve quelque chose de plausible', () => {
    expect(A.size, 'A = ALLOWED_TOOLS').toBeGreaterThan(20);
    expect(D.size, 'D = schemas declares').toBeGreaterThan(20);
    expect(C.size, 'C = union des familles').toBeGreaterThan(20);
  });

  it('un outil temoin de chaque ensemble est bien present', () => {
    // Si une regex derive, ces trois-la disparaissent avant les autres.
    for (const t of ['propose_field_update', 'create_promo_code', 'set_price']) {
      expect(A, `A / ${t}`).toContain(t);
      expect(D, `D / ${t}`).toContain(t);
      expect(C, `C / ${t}`).toContain(t);
    }
  });
});

// ------------------------------------------------------------
describe('DEBT-032 — 🔴 PROPRIETE 1 : A = C = D, aucune divergence silencieuse', () => {
  it('C \\ D — aucun outil accordable n’est absent des schemas (capacite fantome)', () => {
    expect(diff(C, D), 'accordables a un mode mais JAMAIS montres au modele').toEqual([]);
  });

  it('D \\ C — aucun schema n’est accordable a personne (schema mort)', () => {
    expect(diff(D, C), 'declares au modele mais dans aucune famille').toEqual([]);
  });

  it('C \\ A — aucun outil proposable ne serait refuse par /apply (promesse fausse)', () => {
    expect(diff(C, A), 'proposables au modele mais absents de ALLOWED_TOOLS').toEqual([]);
  });

  it('🔴 A \\ C — aucun outil accepte par /apply n’echappe a toute famille', () => {
    // C'est la forme exacte de DEBT-030 : un outil execute que personne ne
    // gouverne. La garde du volet 1 le rend inatteignable, ce qui en fait du
    // code mort -- et le code mort dans une allowlist est ce qui a permis au
    // defaut de naitre.
    expect(diff(A, C), 'acceptes par /apply mais gouvernes par aucune famille').toEqual([]);
  });
});

// ------------------------------------------------------------
describe('DEBT-032 — PROPRIETE 2 : les sept familles PARTITIONNENT C', () => {
  it('elles sont deux a deux disjointes', () => {
    const noms = Object.keys(FAMILLES);
    const chevauchements: string[] = [];
    for (let i = 0; i < noms.length; i++) {
      for (let j = i + 1; j < noms.length; j++) {
        const communs = FAMILLES[noms[i]].filter((t) => FAMILLES[noms[j]].includes(t));
        if (communs.length) chevauchements.push(`${noms[i]} ∩ ${noms[j]} = ${communs.join(', ')}`);
      }
    }
    // Un outil dans deux familles aux modes differents rendrait l'octroi
    // ambigu : il serait accorde par l'une et pas par l'autre, et la reponse
    // dependrait de l'ordre des `if` dans `toolNamesForSite`.
    expect(chevauchements).toEqual([]);
  });

  it('leur somme fait exactement C — aucun doublon, aucun orphelin', () => {
    const total = Object.values(FAMILLES).reduce((n, f) => n + f.length, 0);
    expect(total).toBe(C.size);
  });
});

// ------------------------------------------------------------
describe('DEBT-032 — 🔴 PROPRIETE 3 : outil commercial ⇒ mode admis au commerce', () => {
  it('la declaration de nature ne cite aucun outil inexistant', () => {
    // Une entree obsolete ferait porter l'invariant sur du vide.
    expect(diff(COMMERCIAUX, C), 'declares commerciaux mais absents de toute famille').toEqual([]);
  });

  it('elle couvre les outils DIRECTS et les outils RELAYES', () => {
    // Les deux natures de chemin doivent etre sous l'invariant : les directs
    // ecrivent via `supabaseAdmin` sans filet en aval, les relayes empruntent
    // une route metier gardee. Ne couvrir que les uns laisserait l'autre
    // moitie hors propriete.
    for (const direct of ['create_promo_code', 'catalog_set_margin', 'catalog_approve_all']) {
      expect(COMMERCIAUX, `direct / ${direct}`).toContain(direct);
    }
    for (const relaye of ['catalog_curate', 'catalog_enhance', 'set_price', 'count_product_stock']) {
      expect(COMMERCIAUX, `relaye / ${relaye}`).toContain(relaye);
    }
  });

  it('🔴 L’INVARIANT — aucun mode non admis ne recoit un outil commercial', () => {
    const violations: string[] = [];
    for (const mode of [...MODES_REELS, ...MODES_INVALIDES]) {
      for (const st of SOUS_TYPES) {
        const obtenus = toolNamesForSite(mode, st).filter((t) => COMMERCIAUX.has(t));
        if (obtenus.length > 0 && !canTransact(mode)) {
          violations.push(`mode=${String(mode)} sous-type=${String(st)} -> ${obtenus.join(', ')}`);
        }
      }
    }
    expect(
      violations,
      'un mode NON admis par canTransact recoit un outil produisant un artefact commercial'
    ).toEqual([]);
  });

  it('la reciproque n’est PAS exigee — un mode admis peut n’avoir aucun outil commercial', () => {
    // `canTransact` est une ADMISSION, pas une obligation d'outillage : un
    // Mode 3 `pod_brand` est admis au commerce et ne recoit pourtant aucun
    // outil de catalogue. Exiger l'equivalence interdirait ce cas legitime.
    expect(canTransact(3)).toBe(true);
    expect(toolNamesForSite(3, 'pod_brand').filter((t) => CATALOG_TOOLS.includes(t as never))).toEqual([]);
  });
});

// ------------------------------------------------------------
describe('DEBT-032 — 🔴 PROPRIETE 4 : le Mode 1 est etanche aux capacites commerciales', () => {
  for (const st of SOUS_TYPES) {
    it(`Mode 1 (sous-type ${String(st)}) : zero outil commercial`, () => {
      const obtenus = toolNamesForSite(1, st).filter((t) => COMMERCIAUX.has(t));
      expect(obtenus, 'le sous-type ne doit JAMAIS ouvrir une capacite au Mode 1').toEqual([]);
    });
  }

  it('Mode 1 n’est pas admis au commerce, et c’est la meme autorite qui le dit', () => {
    expect(canTransact(1)).toBe(false);
    expect([...TRANSACTING_SITE_MODES]).not.toContain(1);
  });

  it('🔴 CONTROLE POSITIF — le Mode 1 conserve bien ses capacites editoriales', () => {
    // Sans ce controle, une frontiere devenue trop large passerait aussi :
    // « zero outil commercial » est trivialement vrai si le Mode 1 ne recoit
    // plus rien du tout.
    const m1 = toolNamesForSite(1, null);
    expect(m1.length).toBeGreaterThan(20);
    for (const t of ['propose_field_update', 'propose_faq_add', 'propose_gallery_add', 'propose_product_add']) {
      expect(m1, t).toContain(t);
    }
  });
});

// ------------------------------------------------------------
describe('DEBT-032 — PROPRIETE 5 : chaque famille est HOMOGENE', () => {
  for (const [nom, outils] of Object.entries(FAMILLES)) {
    it(`${nom} est entierement commerciale ou entierement editoriale`, () => {
      const n = outils.filter((t) => COMMERCIAUX.has(t)).length;
      // Une famille a moitie commerciale serait accordee d'un bloc a un mode :
      // la moitie commerciale suivrait l'editoriale et franchirait la
      // frontiere sans qu'aucune ligne ne l'ait decide. C'est ce controle qui
      // detecte un outil DEPLACE d'une famille vers une autre.
      expect(n === 0 || n === outils.length, `${nom} : ${n}/${outils.length} commerciaux`).toBe(true);
    });
  }
});

// ------------------------------------------------------------
describe('DEBT-032 — PROPRIETE 6 : fail-closed sur toute valeur non inscrite', () => {
  for (const mode of MODES_INVALIDES) {
    it(`mode=${String(mode)} ne recoit QUE les outils universels`, () => {
      for (const st of SOUS_TYPES) {
        expect(toolNamesForSite(mode, st).sort(), `sous-type ${String(st)}`)
          .toEqual([...UNIVERSAL_TOOLS].sort());
      }
    });
  }

  it('🔴 les outils universels ne contiennent aucun outil commercial', () => {
    // C'est ce qui rend le fail-closed ci-dessus reellement sur : si un outil
    // commercial entrait dans `UNIVERSAL_TOOLS`, TOUT mode l'obtiendrait, y
    // compris `null` et `NaN`.
    expect([...UNIVERSAL_TOOLS].filter((t) => COMMERCIAUX.has(t))).toEqual([]);
  });
});

// ------------------------------------------------------------
describe('DEBT-032 — 🔒 les modes 1, 2 et 3 restent distincts', () => {
  it('les trois recoivent trois jeux d’outils differents', () => {
    const m1 = toolNamesForSite(1, null).sort().join('|');
    const m2 = toolNamesForSite(2, null).sort().join('|');
    const m3 = toolNamesForSite(3, 'reseller').sort().join('|');
    expect(new Set([m1, m2, m3]).size, 'deux modes au moins ont fusionne').toBe(3);
  });

  it('le sous-type est IMBRIQUE dans le mode, jamais independant', () => {
    // `dropship_type` ne doit rien ouvrir a lui seul : un Mode 1 portant par
    // erreur un sous-type fournisseur ne doit rien gagner.
    const reference = toolNamesForSite(1, null).sort();
    for (const st of SOUS_TYPES) {
      expect(toolNamesForSite(1, st).sort(), `sous-type ${String(st)}`).toEqual(reference);
    }
  });
});

// ------------------------------------------------------------
describe('DEBT-032 — 🔒 CLIQUET DE DENOMINATEUR', () => {
  it('les comptes sont epingles — ajouter ou retirer un outil est un acte visible', () => {
    // Retirer un outil des TROIS ensembles a la fois laisserait l'egalite
    // vraie : seul un compte epingle rend la suppression visible. Ce n'est pas
    // une cible, c'est un declencheur de revue.
    expect(A.size, 'ALLOWED_TOOLS (/apply)').toBe(33);
    expect(C.size, 'union des familles').toBe(33);
    expect(D.size, 'schemas declares (/chat)').toBe(33);
    expect(COMMERCIAL_ARTIFACT_TOOLS.length, 'outils a artefact commercial').toBe(10);
  });

  it('les sept familles sont toutes declarees ici', () => {
    // Une huitieme famille ajoutee sans etre inscrite dans ce fichier
    // echapperait a la propriete 5. Le compte force l'inscription.
    expect(Object.keys(FAMILLES)).toHaveLength(7);
  });
});
