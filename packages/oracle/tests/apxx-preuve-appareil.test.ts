// GRILLE A++ — V1 ET V2 DE `D-135` (2026-09-04).
//
// V1 — le verdict `G` ne repose plus sur `blocks.includes("fill")`. `D-135` a
// FALSIFIÉ cette mesure sur l'artefact réel : retirer la prop `fill` du JSX en
// laissant le commentaire qui la décrit laissait le verdict au vert. Autrement
// dit, réintroduire `DET-025` — parent non borné, 12ᵉ ligne inatteignable sur
// Galaxy A17 — ne déclenchait rien. Ce fichier verrouille la correction PAR LA
// MUTATION : chaque test retire une propriété RÉELLE et exige que la mesure
// tombe. Sans ces contrôles négatifs, une mesure « qui dit toujours oui »
// passerait pour un instrument.
//
// V2 — `A` et `G` ne sont plus déclarées conformes. La grille exige pour l'une
// une « géométrie mesurée sur appareil réel », pour l'autre une « mesure sur
// appareil » ; cet instrument ne lit que du source. Elles valent donc
// `non_determinee` quand les pré-conditions tiennent, et `non_conforme` quand
// une pré-condition MESURABLE échoue — un défaut démontré reste un défaut.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileProject } from "@deribfy/compiler";
import type { ProjectAir } from "@deribfy/air-schema";
import { evaluateApxxGrid } from "../src/apxx-grid.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const resto = JSON.parse(readFileSync(join(CORPUS, "resto-quartier.air.json"), "utf8")) as ProjectAir;

const BLOCKS = "lib/blocks/components.tsx";
const grille = (files: ReadonlyMap<string, string>, air: ProjectAir = resto) => evaluateApxxGrid(files, air);
const dim = (files: ReadonlyMap<string, string>, k: string) =>
  grille(files).dimensions.find((d) => d.dimension === k);

/** Artefact RÉEL du corpus — jamais une fixture écrite pour l'occasion. */
const artefact = (): Map<string, string> => new Map(compileProject(resto).files);

describe("V1 — le bornage de la liste est vérifié STRUCTURELLEMENT", () => {
  it("① bornage réel présent → pré-condition DÉTECTÉE", () => {
    const files = artefact();
    const source = files.get(BLOCKS) ?? "";
    // L'artefact réel porte bien la forme attendue : la garde ci-dessous
    // empêche le test de rester vert si l'émetteur cessait de l'émettre.
    expect(source).toContain("<Section title={title} testID={testID} fill>");
    const g = dim(files, "G");
    expect(g?.detail).toContain("<Section fill> encadrant une <FlatList>");
    // ÉDITION CONSCIENTE (V3) : le libellé provient désormais du lecteur de
    // preuve appareil. Casse suivie ; l'ÉTAT attendu est inchangé.
    expect(g?.detail).toContain("pré-conditions structurelles TENUES");
  });

  it("② FALSIFICATION D-135 : prop `fill` retirée, COMMENTAIRE conservé → NON détecté", () => {
    const files = artefact();
    const source = files.get(BLOCKS) ?? "";
    const mute = source.replace(
      "<Section title={title} testID={testID} fill>",
      "<Section title={title} testID={testID}>",
    );
    expect(mute).not.toBe(source);
    // Le commentaire qui DÉCRIT `fill` est toujours là : c'est lui qui
    // satisfaisait l'ancienne mesure par sous-chaîne.
    expect(mute).toContain("`fill` (DET-006)");
    expect(mute).toContain("fill");

    const g = dim(files.set(BLOCKS, mute), "G");
    expect(g?.state).toBe("non_conforme");
    expect(g?.detail).toContain("PRÉ-CONDITION EN ÉCHEC");
    // `fill` était l'UNIQUE occurrence structurelle : il n'en reste aucune.
    // Le cas « une `fill` existe mais au mauvais endroit » est couvert par ⑤.
    expect(g?.detail).toContain("aucune <Section fill> dans l'arbre syntaxique");
  });

  it("③ aucun bornage nulle part → NON détecté", () => {
    const files = artefact();
    const g = dim(files.set(BLOCKS, "export const Rien = 1;\n"), "G");
    expect(g?.state).toBe("non_conforme");
    expect(g?.detail).toContain("aucune <Section fill> dans l'arbre syntaxique");
  });

  it("④ FAUX POSITIF PAR COMMENTAIRE IMPOSSIBLE — 4 formes, aucune ne conclut", () => {
    // Un commentaire est de la TRIVIA : il ne peut pas être un attribut JSX.
    // La propriété est donc structurelle, pas probabiliste.
    const leurres = [
      '// <Section title={t} fill><FlatList /></Section>\nexport const X = 1;\n',
      '/* <Section fill><FlatList data={d} /></Section> */\nexport const X = 1;\n',
      'export const doc = "<Section fill><FlatList /></Section>";\n',
      '/** @example <Section fill><FlatList /></Section> */\nexport const X = 1;\n',
    ];
    for (const leurre of leurres) {
      const files = artefact();
      const g = dim(files.set(BLOCKS, leurre), "G");
      expect(g?.state, leurre.slice(0, 40)).toBe("non_conforme");
      expect(g?.detail, leurre.slice(0, 40)).toContain("PRÉ-CONDITION EN ÉCHEC");
    }
  });

  it("⑤ `fill` posée AILLEURS que sur le parent de la liste → NON détecté", () => {
    // Contrôle de PRÉCISION : la mesure porte sur le parent de la FlatList,
    // pas sur la présence d'un `fill` quelque part dans le fichier.
    const files = artefact();
    const source = files.get(BLOCKS) ?? "";
    const deplace = source
      .replace("<Section title={title} testID={testID} fill>", "<Section title={title} testID={testID}>")
      .concat("\nexport const Ailleurs = () => <Section fill><Badge label=\"x\" /></Section>;\n");
    const g = dim(files.set(BLOCKS, deplace), "G");
    expect(g?.state).toBe("non_conforme");
    expect(g?.detail).toContain("mais AUCUNE n'encadre de <FlatList>");
  });

  it("⑥ `fill={false}` ne conclut pas ; `fill={true}` conclut", () => {
    const source = artefact().get(BLOCKS) ?? "";
    const cible = "<Section title={title} testID={testID} fill>";

    const faux = artefact();
    faux.set(BLOCKS, source.replace(cible, "<Section title={title} testID={testID} fill={false}>"));
    expect(dim(faux, "G")?.state).toBe("non_conforme");

    const vrai = artefact();
    vrai.set(BLOCKS, source.replace(cible, "<Section title={title} testID={testID} fill={true}>"));
    expect(dim(vrai, "G")?.detail).toContain("<Section fill> encadrant une <FlatList>");
  });
});

describe("V2 — A et G ne concluent JAMAIS à la conformité", () => {
  it("sur l'artefact réel, A et G valent `non_determinee` — jamais `conforme`", () => {
    const report = grille(artefact());
    const a = report.dimensions.find((d) => d.dimension === "A");
    const g = report.dimensions.find((d) => d.dimension === "G");
    expect(a?.state).toBe("non_determinee");
    expect(g?.state).toBe("non_determinee");
    expect(a?.detail).toContain("géométrie mesurée sur appareil réel");
    expect(g?.detail).toContain("mesure sur appareil");
  });

  it("l'information structurelle de V1 n'est PAS perdue : elle reste dans le détail", () => {
    const report = grille(artefact());
    const a = report.dimensions.find((d) => d.dimension === "A");
    const g = report.dimensions.find((d) => d.dimension === "G");
    expect(a?.detail).toContain("tapTarget=48");
    // 5 surfaces contraintes sur l'artefact COMPILÉ À NEUF. Le chiffre « 3 »
    // cité par `D-135` provient de l'artefact VERSIONNÉ sous
    // `slices/restaurant/app/`, qui est PÉRIMÉ par rapport à l'émetteur
    // courant (mesuré : 5 vs 3, fichiers non identiques). La conclusion de
    // `D-135` est intacte — elle ne repose pas sur ce compte mais sur la
    // NATURE de la preuve — mais la marge au seuil est plus large qu'annoncé.
    // ÉDITION CONSCIENTE (2026-09-05, phase 2 de la refonte UX) : 5 → 6.
    // Le panneau de navigation a gagné un état ACTIF (`primaryNavItemActive`),
    // et cet état porte lui aussi `minHeight: theme.size.tapTarget`. Une
    // surface contrainte de PLUS : la dimension A y gagne, elle n'y perd rien.
    // Surfaces mesurées : button · input · primaryNavItem · primaryNavContainer
    // · row · imageHeader — puis `buttonChip` (DET-034) : le chip de filtre
    // garde `tapTarget` par construction, et l'instrument le VOIT — 7ᵉ surface
    // contrainte, pas une exemption.
    expect(a?.detail).toContain("7 surface(s) contrainte(s)");
    expect(a?.detail).toContain("NON MESURÉ : zones sûres");
    expect(g?.detail).toContain("0 encapsulé dans un ScrollView");
    expect(g?.detail).toContain("NON MESURÉ : jank au défilement");
  });

  it("POUVOIR DE DÉTECTION CONSERVÉ : une pré-condition en échec reste `non_conforme`", () => {
    // V2 ne doit pas transformer un défaut démontré en « non déterminé » :
    // ce serait masquer une dette, pas suspendre une conclusion.
    const files = artefact();
    const theme = files.get("lib/tokens/theme.generated.ts") ?? "";
    files.set("lib/tokens/theme.generated.ts", theme.replace('"tapTarget": 48', '"tapTarget": 40'));
    const a = dim(files, "A");
    expect(a?.state).toBe("non_conforme");
    expect(a?.detail).toContain("PRÉ-CONDITION STATIQUE EN ÉCHEC");
    expect(a?.detail).toContain("tapTarget=40");
  });

  it("A++ n'est pas établi : `passed` est false, et pas parce qu'un défaut est prouvé", () => {
    const report = grille(artefact());
    expect(report.passed).toBe(false);
    // Aucune dimension n'est `non_conforme` : ce qui manque est la PREUVE,
    // pas la qualité. C'est la distinction que `D-135` impose.
    expect(report.dimensions.filter((d) => d.state === "non_conforme")).toEqual([]);
  });

  it("B/C/D/E/F restent CONFORMES et H `non_determinee` — aucune dimension dégradée", () => {
    const report = grille(artefact());
    const etat = (k: string) => report.dimensions.find((d) => d.dimension === k)?.state;
    expect(etat("B")).toBe("conforme");
    expect(etat("C")).toBe("conforme");
    expect(etat("D")).toBe("conforme");
    expect(etat("E")).toBe("conforme");
    expect(etat("F")).toBe("conforme");
    expect(etat("H")).toBe("non_determinee");
  });
});
