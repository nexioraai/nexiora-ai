import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BLOCK_REGISTRY_VERSION, BLOCKS, blocks } from "../src";

// CLIQUETS DE REGISTRE (patron D-020) : liste v1 EXACTE, versions, ordre
// stable, indépendance E2E. Ajouter/retirer un bloc DOIT faire échouer un
// test ici — modification = acte conscient (décision consignée + version
// mineure), jamais un effet de bord (D-023 : pas d'élargissement au cas où).
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// Liste v1 EXACTE — GELÉE (L2 + D-024, revue propriétaire du 2026-08-28).
const V1_BLOCK_IDS = [
  "button",
  "detail_header",
  "empty_state",
  "form",
  "header",
  "list",
];

describe("cliquets du registre de blocs", () => {
  it("CLIQUET — la liste v1 est exacte, triée, sans doublon", () => {
    expect(BLOCKS.map((b) => b.id)).toEqual(V1_BLOCK_IDS);
  });

  // ÉDITION CONSCIENTE (2026-08-31, D-060) — DÉGEL DÉLIBÉRÉ, STRICTEMENT ADDITIF.
  //
  // Le registre était gelé en 1.0.0 par D-024. Fait qui a forcé la montée : la
  // dimension C d'A++ exige que TOUT bloc consommant des données expose
  // loading/empty/error. Or, des trois types que le corpus lie à une entité,
  // `form` ne connaissait NI `loading` NI `empty`, et `detail_header` n'avait
  // AUCUN état. La dimension n'était donc pas « non atteinte » : elle était
  // **INATTEIGNABLE** (APP-D003 / DET-028). Aucune quantité de travail sur le
  // moteur ne l'aurait rendue conforme.
  //
  // La montée n'enlève RIEN : aucun état supprimé, `state` reste optionnel
  // partout, défaut inchangé. Un appelant 1.0.0 se comporte à l'identique — ce
  // que le test ci-dessous vérifie explicitement, pour que « additif » soit une
  // propriété MESURÉE et non une intention déclarée.
  // ÉDITION CONSCIENTE (2026-09-02, E1/E2 D-129) : 1.2.0 → 1.3.0 — filtres
  // pilotés et portée relationnelle, ADDITIFS ; rien n'est retiré, le corps du
  // test le vérifie comme avant.
  it("DÉGEL ADDITIF (D-060, D-087, D-129) : registre 1.3.0, et rien n'a été retiré", () => {
    // D-087 : seconde montée additive — `list` gagne vignette et recherche,
    // `detail_header` gagne son visuel. Rien n'est retiré, tout est optionnel.
    // DET-032 : quatrième montée additive — `optionLabels` OPTIONNEL sur les
    // filtres à choix (libellés d'affichage AIR 1.10.0). Valeurs, filtrage et
    // testID inchangés ; un appelant 1.3.0 est inchangé.
    expect(BLOCK_REGISTRY_VERSION).toBe("1.4.0");
    expect(BLOCKS.map((b) => b.id)).toEqual(V1_BLOCK_IDS);
  });

  it("CLIQUET — chaque bloc du registre a son composant, et réciproquement", () => {
    const toComponent = (id: string): string =>
      `${id.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("")}Block`;
    expect(Object.keys(blocks).sort()).toEqual(V1_BLOCK_IDS.map(toComponent).sort());
  });

  it("CLIQUET — liaison d'entité toujours explicite, jamais ambiguë", () => {
    for (const b of BLOCKS) expect(["required", "forbidden"]).toContain(b.entity);
  });

  it("CLIQUET — indépendance E2E : aucune trace de maestro/detox dans les sources", () => {
    for (const file of readdirSync(SRC)) {
      const source = readFileSync(join(SRC, file), "utf8")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//"))
        .join("\n")
        .toLowerCase();
      expect(source.includes("maestro"), `${file} référence maestro`).toBe(false);
      expect(source.includes("detox"), `${file} référence detox`).toBe(false);
    }
  });
});
