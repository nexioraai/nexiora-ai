// ABSTRACTION PROVIDER CÔTÉ COMPILATEUR (Phase 10 — §15).
//
// Critère de sortie visé : « preuve de substitution de provider SANS
// CHANGEMENT D'AIR ». La preuve exigeante n'est pas qu'un champ du lock
// change — c'est que TOUT LE RESTE ne change pas : même document, même
// airHash, même artefact compilé, octet pour octet.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "@deribfy/air-schema";
import { ProviderRegistryError } from "@deribfy/provider-registry";
import { compileProject } from "../src/compile-project.ts";
import { resolveLock } from "../src/resolve-lock.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const docs = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".air.json"))
  .sort();
const load = (f: string): unknown => JSON.parse(readFileSync(join(CORPUS, f), "utf8"));
const resto = load("resto-quartier.air.json");

describe("résolution des providers dans le lock", () => {
  it("12/12 documents : providers résolus, triés, conformes au schéma", () => {
    for (const file of docs) {
      const lock = resolveLock(load(file));
      expect(lock.resolved.providers.length, file).toBeGreaterThan(0);
      const classes = lock.resolved.providers.map((p) => p.providerClass);
      expect([...classes].sort(), file).toEqual(classes);
      expect(new Set(classes).size, file).toBe(classes.length);
    }
  });

  it("déterminisme : le lock reste byte-identique d'une résolution à l'autre", () => {
    for (const file of docs) {
      const a = canonicalJson(resolveLock(load(file)));
      const b = canonicalJson(resolveLock(load(file)));
      expect(b, file).toBe(a);
    }
  });
});

describe("substitution de provider — preuve SANS changement d'AIR", () => {
  it("le document, son hash et l'artefact compilé sont INCHANGÉS", () => {
    const avant = canonicalJson(resto);
    const base = compileProject(resto);
    const substitue = compileProject(resto, undefined, {
      providerOverrides: { payments_psp: "mock", analytics: "mock" },
    });
    // 1. l'AIR n'a pas été touché (ni en mémoire, ni dans son hash)
    expect(canonicalJson(resto)).toBe(avant);
    expect(substitue.lock.airHash).toBe(base.lock.airHash);
    // 2. l'artefact compilé est identique OCTET POUR OCTET
    expect(substitue.rootHash).toBe(base.rootHash);
    expect([...substitue.files.keys()]).toEqual([...base.files.keys()]);
    for (const [path, content] of base.files) {
      expect(sha256Hex(substitue.files.get(path) ?? ""), path).toBe(sha256Hex(content));
    }
    // 3. SEUL le lock enregistre le changement
    const psp = substitue.lock.resolved.providers.find((p) => p.providerClass === "payments_psp");
    expect(psp?.provider).toBe("mock");
    expect(base.lock.resolved.providers.find((p) => p.providerClass === "payments_psp")?.provider).toBe(
      "@stripe/stripe-react-native",
    );
  });

  it("aucun fichier émis ne nomme un provider concret (v1 — fait mesuré)", () => {
    // C'est CE fait qui rend la substitution gratuite aujourd'hui : le code
    // généré ne connaît aucun fournisseur. Si un jour il en nommait un, ce
    // test tomberait — et la substitution devrait alors être re-prouvée
    // au niveau de l'artefact, pas seulement du lock.
    const compiled = compileProject(resto);
    const concrets = ["@stripe/stripe-react-native", "posthog-react-native", "expo-notifications"];
    const fautifs: string[] = [];
    for (const [path, content] of compiled.files) {
      if (path === "package.json" || path === "package-lock.json") continue;
      if (concrets.some((p) => content.includes(p))) fautifs.push(path);
    }
    expect(fautifs).toEqual([]);
  });

  it("FAIL-CLOSED : substitution invalide refusée à la compilation", () => {
    expect(() => compileProject(resto, undefined, { providerOverrides: { maps: "mock" } })).toThrow(
      ProviderRegistryError,
    );
    expect(() =>
      compileProject(resto, undefined, { providerOverrides: { payments_psp: "fournisseur_invente" } }),
    ).toThrow(ProviderRegistryError);
  });
});
