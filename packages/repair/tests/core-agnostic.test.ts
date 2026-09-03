// CLIQUET D'INDÉPENDANCE DU CŒUR (patron des cliquets `engine-agnostic` du
// paquet workflow et `provider-agnostic` du paquet sandbox).
//
// Ce que ce cliquet protège : la boucle ne doit JAMAIS pouvoir se juger
// elle-même ni écrire un artefact. Si `src/` importait l'Oracle ou le
// compilateur, rien n'empêcherait plus une version future d'appeler le juge
// en interne — et la séparation juge/auteur redeviendrait une convention
// d'usage au lieu d'un invariant. Les tests, eux, ont le droit (et le
// devoir) de câbler les vrais ports.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { apxxRegressions as oracleRegressions } from "@deribfy/oracle";
import { apxxRegressions } from "../src/loop.ts";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(PKG, "src");
const sources = readdirSync(SRC)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: f, code: readFileSync(join(SRC, f), "utf8") }));

const INTERDITS = [
  "@deribfy/oracle",
  "@deribfy/compiler",
  "@deribfy/provisioner",
  "@deribfy/sandbox",
  "@anthropic-ai/sdk",
  "openai",
  "node:fs",
  "node:http",
  "node:https",
];

describe("cœur PUR et agnostique", () => {
  it("aucune source du cœur n'importe un juge, un moteur ou un SDK", () => {
    for (const { file, code } of sources) {
      for (const specifier of INTERDITS) {
        expect(code.includes(`from "${specifier}"`), `${file} → ${specifier}`).toBe(false);
      }
    }
  });

  it("aucun accès au temps, à l'aléa ni au réseau dans le cœur", () => {
    for (const { file, code } of sources) {
      expect(/Date\.now\(|new Date\(|Math\.random\(|fetch\(/.test(code), file).toBe(false);
    }
  });

  it("la seule dépendance de runtime est la politique de slots", () => {
    const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@deribfy/air-schema", "@deribfy/slots"]);
  });

  it("le comparateur A++ local est ÉQUIVALENT à celui de l'Oracle", () => {
    // Le cœur ne dépend pas de l'Oracle ; il porte donc sa propre copie du
    // comparateur. Ce test interdit la dérive silencieuse entre les deux.
    const etats = ["conforme", "non_determinee", "non_conforme"] as const;
    for (const avant of etats) {
      for (const apres of etats) {
        const before = [{ dimension: "X", state: avant }];
        const after = [{ dimension: "X", state: apres }];
        expect(apxxRegressions(before, after)).toEqual(
          oracleRegressions(
            { passed: false, dimensions: [{ dimension: "X" as never, titre: "", state: avant, detail: "" }] },
            { passed: false, dimensions: [{ dimension: "X" as never, titre: "", state: apres, detail: "" }] },
          ),
        );
      }
    }
  });
});
