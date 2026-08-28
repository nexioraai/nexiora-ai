import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CLIQUETS D'ÉTANCHÉITÉ (D-021/D-023, patron 3.2 mécanisé) :
//   1. contracts.ts n'importe QUE des types de react ;
//   2. components.tsx ne compose QUE des primitives — seul import
//      react-native autorisé : FlatList (structurel) ; AUCUN StyleSheet,
//      AUCUN style en dur (tout le visuel vient des primitives/tokens).
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const stripComments = (s: string): string =>
  s.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const read = (f: string): string =>
  stripComments(readFileSync(join(SRC, f), "utf8"));
const importsOf = (source: string): string[] =>
  [...source.matchAll(/^import\s[^;]*?from\s+"([^"]+)";?$/gms)].map((m) => m[1] ?? "");

describe("étanchéité des blocs", () => {
  it("CLIQUET — contracts.ts n'importe que des types de react", () => {
    const source = read("contracts.ts");
    expect(importsOf(source)).toEqual(["react"]);
    expect(source).toMatch(/import type \{/);
    expect(source).not.toMatch(/^import \{/m);
  });

  it("CLIQUET — components.tsx : primitives + FlatList uniquement", () => {
    const source = read("components.tsx");
    expect(importsOf(source).sort()).toEqual([
      "./contracts.ts",
      "@deribfy/primitives",
      "react-native",
    ]);
    const rn = /import \{([^}]+)\} from "react-native"/.exec(source);
    expect(rn?.[1]?.trim()).toBe("FlatList");
  });

  it("CLIQUET — aucun style dans les blocs (StyleSheet, style=, tokens directs)", () => {
    const source = read("components.tsx");
    expect(source).not.toMatch(/StyleSheet/);
    expect(source).not.toMatch(/style=/);
    expect(source).not.toMatch(/@deribfy\/design-tokens/);
  });
});
