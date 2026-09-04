// CANAL DE PREUVE APPAREIL — V3 de `D-135`.
//
// Ce fichier verrouille UNE propriété avant toutes les autres : **aucun chemin
// ne peut produire `A = conforme` ou `G = conforme` sans preuve appareil
// recevable**. Les cas de refus sont donc traités comme les cas-tueurs qu'ils
// sont — chacun retire une pièce RÉELLE de la preuve et exige que le verdict
// retombe à `non_determinee`, jamais qu'il glisse vers le vert.
//
// Les preuves utilisées ici sont des FIXTURES SYNTHÉTIQUES construites en
// mémoire. Aucune n'est écrite dans `docs/elite-protocol/evidence/appareil/` :
// une preuve d'appareil ne s'invente pas, elle se relève en session physique.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileProject } from "@deribfy/compiler";
import { hashCanonical, type ProjectAir } from "@deribfy/air-schema";
import { evaluateApxxGrid } from "../src/apxx-grid.ts";
import {
  CIBLE_TACTILE_MIN_DP,
  FENETRE_RENDU_EN_ECRANS,
  LIGNES_MIN_POUR_VIRTUALISATION,
  PREUVE_APPAREIL_SCHEMA,
  lirePreuveAppareil,
  type CaptureAppareil,
  type NoeudHierarchie,
  type PreuveAppareil,
} from "../src/preuve-appareil.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const resto = JSON.parse(readFileSync(join(CORPUS, "resto-quartier.air.json"), "utf8")) as ProjectAir;
const files = compileProject(resto).files;

const DENSITE = 3;
const HAUTEUR = 2340;
const INSET_BAS = 120;

/** Premier bloc `button` et premier bloc `list` RÉELS du document. */
const premierBouton = resto.screens.flatMap((s) => s.blocks).find((b) => b.blockType === "button")?.id ?? "";
const premiereListe = resto.screens.flatMap((s) => s.blocks).find((b) => b.blockType === "list")?.id ?? "";

const noeud = (id: string, y1: number, y2: number): NoeudHierarchie => ({
  attributes: { "resource-id": id, bounds: `[0,${String(y1)}][1080,${String(y2)}]` },
});

/** Cible conforme : 150 px / densité 3 = 50 dp ≥ 48, et au-dessus de l'inset bas. */
const cibleOk = (id: string): NoeudHierarchie => noeud(id, 400, 550);

const captureA12 = (enfants: readonly NoeudHierarchie[]): CaptureAppareil => ({
  etape: "A12",
  ecranId: resto.navigation.entryScreenId,
  hierarchie: { attributes: { bounds: "[0,0][1080,2340]" }, children: enfants },
});

const captureA13 = (montees: number, servies: number): CaptureAppareil => ({
  etape: "A13",
  ecranId: resto.navigation.entryScreenId,
  hierarchie: {
    attributes: { bounds: "[0,0][1080,2340]" },
    children: Array.from({ length: montees }, (_, i) => cibleOk(`${premiereListe}-row-l${String(i)}`)),
  },
  liste: { blocId: premiereListe, lignesServies: servies },
});

const preuve = (over: Partial<PreuveAppareil> = {}): PreuveAppareil => ({
  schema: PREUVE_APPAREIL_SCHEMA,
  capturedAt: "2026-09-10T09:00:00Z",
  build: {
    easBuildId: "c96c4359-71b6-40a3-9724-8af2a3459917",
    artefactSha256: "a".repeat(64),
    airHash: hashCanonical(resto),
  },
  appareil: { plateforme: "android", modele: "Galaxy A17", os: "Android 15" },
  ecran: { largeurPx: 1080, hauteurPx: HAUTEUR, densite: DENSITE },
  insets: { hautPx: 90, basPx: INSET_BAS, gauchePx: 0, droitePx: 0 },
  captures: [captureA12([cibleOk(premierBouton)]), captureA13(8, 40)],
  ...over,
});

const dim = (p: PreuveAppareil | undefined, k: "A" | "G") =>
  evaluateApxxGrid(files, resto, [], p).dimensions.find((d) => d.dimension === k);

describe("V3 — recevabilité : une preuve incomplète est REFUSÉE, jamais dégradée en vert", () => {
  it("le document porte bien un bouton et une liste (garde de la fixture)", () => {
    expect(premierBouton).not.toBe("");
    expect(premiereListe).not.toBe("");
  });

  it("preuve ABSENTE → A et G non_determinee", () => {
    const lecture = lirePreuveAppareil(undefined, resto);
    expect(lecture.recevable).toBe(false);
    expect(lecture.a.state).toBe("non_determinee");
    expect(lecture.g.state).toBe("non_determinee");
    expect(dim(undefined, "A")?.state).toBe("non_determinee");
    expect(dim(undefined, "G")?.state).toBe("non_determinee");
  });

  const refus: readonly (readonly [string, PreuveAppareil, string])[] = [
    ["schéma inconnu", preuve({ schema: "autre/9" }), "schéma inconnu"],
    [
      "hiérarchie absente",
      preuve({ captures: [{ etape: "A12", ecranId: "x", hierarchie: {} }] }),
      "sans hiérarchie brute exploitable",
    ],
    [
      "densité absente",
      preuve({ ecran: { largeurPx: 1080, hauteurPx: HAUTEUR, densite: 0 } }),
      "densité d'écran absente",
    ],
    [
      "insets absents",
      preuve({ insets: { hautPx: 90, basPx: Number.NaN, gauchePx: 0, droitePx: 0 } }),
      "insets système absents",
    ],
    [
      "rattachement au build FAUX",
      preuve({ build: { easBuildId: "x", artefactSha256: "b".repeat(64), airHash: "0".repeat(64) } }),
      "rattachement au build FAUX",
    ],
    [
      "identifiant de build absent",
      preuve({ build: { easBuildId: "  ", artefactSha256: "b".repeat(64), airHash: hashCanonical(resto) } }),
      "identifiant de build EAS absent",
    ],
    [
      "empreinte d'artefact absente",
      preuve({ build: { easBuildId: "x", artefactSha256: "", airHash: hashCanonical(resto) } }),
      "empreinte de l'artefact installé absente",
    ],
    ["aucune capture", preuve({ captures: [] }), "aucune capture"],
    ["horodatage absent", preuve({ capturedAt: "  " }), "horodatage absent"],
  ];

  for (const [nom, p, motif] of refus) {
    it(`REFUS — ${nom} → non_determinee, motif nommé, JAMAIS conforme`, () => {
      const lecture = lirePreuveAppareil(p, resto);
      expect(lecture.recevable, nom).toBe(false);
      expect(lecture.motifs.join(" · "), nom).toContain(motif);
      expect(lecture.a.state, nom).toBe("non_determinee");
      expect(lecture.g.state, nom).toBe("non_determinee");
      expect(dim(p, "A")?.state, nom).toBe("non_determinee");
      expect(dim(p, "G")?.state, nom).toBe("non_determinee");
    });
  }
});

describe("V3 — dimension A : mesurée, réfutable, jamais conforme sans mesure", () => {
  it("preuve VALIDE et cibles conformes → A conforme, adossée à la géométrie", () => {
    const a = dim(preuve(), "A");
    expect(a?.state).toBe("conforme");
    expect(a?.detail).toContain("MESURÉE SUR APPAREIL (A12)");
    expect(a?.detail).toContain("Galaxy A17");
    expect(a?.detail).toContain("Champs de formulaire HORS PÉRIMÈTRE");
  });

  it("cible TROP PETITE mesurée → A non_conforme", () => {
    // 100 px / densité 3 = 33,3 dp < 48 dp.
    const p = preuve({ captures: [captureA12([noeud(premierBouton, 400, 500)]), captureA13(8, 40)] });
    const a = dim(p, "A");
    expect(a?.state).toBe("non_conforme");
    expect(a?.detail).toContain("MESURE APPAREIL EN ÉCHEC");
    expect(a?.detail).toContain(`< ${String(CIBLE_TACTILE_MIN_DP)} dp`);
  });

  it("cible SOUS LA BARRE SYSTÈME → A non_conforme (reproduit DET-001)", () => {
    const p = preuve({ captures: [captureA12([noeud(premierBouton, 2213, 2340)]), captureA13(8, 40)] });
    const a = dim(p, "A");
    expect(a?.state).toBe("non_conforme");
    expect(a?.detail).toContain("déborde sous la barre système");
  });

  it("capture A12 absente → A non_determinee, G reste lisible", () => {
    const p = preuve({ captures: [captureA13(8, 40)] });
    expect(dim(p, "A")?.state).toBe("non_determinee");
    expect(dim(p, "A")?.detail).toContain("aucune capture A12");
  });

  it("hiérarchie sans AUCUNE cible du document → A non_determinee, jamais conforme", () => {
    const p = preuve({ captures: [captureA12([cibleOk("un-id-etranger")]), captureA13(8, 40)] });
    const a = dim(p, "A");
    expect(a?.state).toBe("non_determinee");
    expect(a?.detail).toContain("aucune cible tactile du document");
  });
});

describe("V3 — dimension G : réfutable, JAMAIS conforme dans le minimum", () => {
  it("virtualisation OBSERVÉE → G reste non_determinee (le jank n'est pas mesuré)", () => {
    const g = dim(preuve(), "G");
    expect(g?.state).toBe("non_determinee");
    expect(g?.detail).toContain("virtualisation OBSERVÉE");
    expect(g?.detail).toContain("jank");
  });

  // La borne de réfutation est DÉRIVÉE : 21 écrans × hauteur d'écran / plus
  // petite hauteur de ligne mesurée. Sur la fixture de test (écran 2340 px,
  // lignes de 150 px) elle vaut 21 × 2340 / 150 = 327,6 lignes.
  const CAPACITE = (FENETRE_RENDU_EN_ECRANS * HAUTEUR) / 150;

  it("la borne dérivée vaut bien 21 × hauteur d'écran / hauteur de ligne", () => {
    expect(CAPACITE).toBeCloseTo(327.6, 1);
  });

  it("ANTI-FAUX-NÉGATIF — toutes montées, quantité COMPATIBLE avec la fenêtre RN → non_determinee", () => {
    // 40 lignes tiennent très largement dans une fenêtre de 327 : une FlatList
    // correctement virtualisée les monte TOUTES. Réfuter ici serait un faux
    // négatif — c'est exactement le défaut que la constante 50 produisait.
    const p = preuve({ captures: [captureA12([cibleOk(premierBouton)]), captureA13(40, 40)] });
    const g = dim(p, "G");
    expect(g?.state).toBe("non_determinee");
    expect(g?.detail).toContain("tout monter est LÉGITIME");
    expect(g?.detail).toContain("borne DÉRIVÉE");
  });

  it("ANTI-FAUX-NÉGATIF — la borne dérivée couvre l'ancienne constante 50", () => {
    // Preuve directe que l'ancien seuil produisait un faux négatif : à 50
    // lignes toutes montées, la règle dérivée REFUSE de réfuter.
    const p = preuve({ captures: [captureA12([cibleOk(premierBouton)]), captureA13(50, 50)] });
    expect(dim(p, "G")?.state).toBe("non_determinee");
  });

  it("juste SOUS la borne → non_determinee ; juste AU-DESSUS → non_conforme", () => {
    const sous = Math.floor(CAPACITE);
    const dessus = Math.ceil(CAPACITE) + 1;
    const cas = (n: number) =>
      dim(preuve({ captures: [captureA12([cibleOk(premierBouton)]), captureA13(n, n)] }), "G");
    expect(cas(sous)?.state, `${String(sous)} lignes`).toBe("non_determinee");
    expect(cas(dessus)?.state, `${String(dessus)} lignes`).toBe("non_conforme");
  });

  it("quantité RÉELLEMENT incompatible avec la fenêtre → G non_conforme (signature DET-025)", () => {
    const n = Math.ceil(CAPACITE) * 2;
    const p = preuve({ captures: [captureA12([cibleOk(premierBouton)]), captureA13(n, n)] });
    const g = dim(p, "G");
    expect(g?.state).toBe("non_conforme");
    expect(g?.detail).toContain("AUCUNE fenêtre de virtualisation");
    expect(g?.detail).toContain("DET-025");
    expect(g?.detail).toContain("borne dérivée");
  });

  it("hauteur de ligne INDISPONIBLE → aucune réfutation possible, non_determinee", () => {
    // Lignes présentes mais de hauteur nulle : la borne n'est pas calculable.
    const plates: CaptureAppareil = {
      etape: "A13",
      ecranId: "x",
      hierarchie: {
        attributes: { bounds: "[0,0][1080,2340]" },
        children: Array.from({ length: 900 }, (_, i) => noeud(`${premiereListe}-row-p${String(i)}`, 500, 500)),
      },
      liste: { blocId: premiereListe, lignesServies: 900 },
    };
    const p = preuve({ captures: [captureA12([cibleOk(premierBouton)]), plates] });
    const g = dim(p, "G");
    expect(g?.state).toBe("non_determinee");
    expect(g?.detail).toContain("géométrie insuffisante");
  });

  it("liste TROP COURTE → G non_determinee, pas de conclusion arrachée", () => {
    const court = LIGNES_MIN_POUR_VIRTUALISATION - 1;
    const p = preuve({ captures: [captureA12([cibleOk(premierBouton)]), captureA13(court, court)] });
    const g = dim(p, "G");
    expect(g?.state).toBe("non_determinee");
    expect(g?.detail).toContain("liste trop courte");
  });

  it("capture A13 sans déclaration de liste → G non_determinee", () => {
    const sansListe: CaptureAppareil = { etape: "A13", ecranId: "x", hierarchie: cibleOk("un-id") };
    const p = preuve({ captures: [captureA12([cibleOk(premierBouton)]), sansListe] });
    expect(dim(p, "G")?.state).toBe("non_determinee");
    expect(dim(p, "G")?.detail).toContain("sans déclaration de liste");
  });

  it("CLIQUET — aucune preuve, même parfaite, ne rend G conforme dans le minimum V3", () => {
    for (const [montees, servies] of [[1, 100], [8, 40], [50, 500]] as const) {
      const p = preuve({ captures: [captureA12([cibleOk(premierBouton)]), captureA13(montees, servies)] });
      expect(dim(p, "G")?.state, `${String(montees)}/${String(servies)}`).not.toBe("conforme");
    }
  });
});

describe("V3 — la pré-condition statique garde la priorité, et A++ reste NON ÉTABLI", () => {
  it("pré-condition statique EN ÉCHEC → non_conforme même avec une preuve valide", () => {
    // Le faux vert que V1 a supprimé ne doit pas revenir par la porte V3 :
    // une preuve appareil ne rachète pas un défaut structurel démontré.
    const sansBornage = new Map(files);
    sansBornage.set("lib/blocks/components.tsx", "export const Rien = 1;\n");
    const g = evaluateApxxGrid(sansBornage, resto, [], preuve()).dimensions.find((d) => d.dimension === "G");
    expect(g?.state).toBe("non_conforme");
    expect(g?.detail).toContain("PRÉ-CONDITION EN ÉCHEC");
  });

  it("avec une preuve valide, A++ n'est toujours pas établi (G non déterminée)", () => {
    const report = evaluateApxxGrid(files, resto, [], preuve());
    expect(report.passed).toBe(false);
    expect(report.dimensions.find((d) => d.dimension === "A")?.state).toBe("conforme");
    expect(report.dimensions.find((d) => d.dimension === "G")?.state).toBe("non_determinee");
  });

  it("B/C/D/E/F/H sont INCHANGÉES par la présence d'une preuve appareil", () => {
    const sans = evaluateApxxGrid(files, resto);
    const avec = evaluateApxxGrid(files, resto, [], preuve());
    const etats = (r: ReturnType<typeof evaluateApxxGrid>) =>
      r.dimensions.filter((d) => !"AG".includes(d.dimension)).map((d) => `${d.dimension}:${d.state}`);
    expect(etats(avec)).toEqual(etats(sans));
    expect(etats(avec)).toEqual([
      "B:conforme",
      "C:conforme",
      "D:conforme",
      "E:conforme",
      "F:conforme",
      "H:non_determinee",
    ]);
  });
});
