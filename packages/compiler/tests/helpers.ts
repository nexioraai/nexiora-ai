// Aides de TEST (jamais importées par src/ — le chemin de résolution reste
// pur, sans fs) : hash Merkle d'un arbre de sources, même algorithme que
// le calcul des scellés du release train (fichiers triés par point de
// code, `chemin sha256(contenu)` par ligne, SHA-256 de l'ensemble).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const sha256 = (data: string | Buffer): string =>
  createHash("sha256").update(data).digest("hex");

const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

export function hashSourceTree(
  root: string,
  extraFiles: readonly (readonly [name: string, path: string])[] = [],
): string {
  const files: string[] = [];
  const walk = (rel: string): void => {
    const entries = readdirSync(join(root, rel === "" ? "." : rel), {
      withFileTypes: true,
    }).sort((x, y) => byCodeUnit(x.name, y.name));
    for (const entry of entries) {
      const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(relPath);
      else files.push(relPath);
    }
  };
  walk("");
  const lines = files
    .sort(byCodeUnit)
    .map((p) => `${p} ${sha256(readFileSync(join(root, p)))}`);
  for (const [name, path] of extraFiles) {
    lines.push(`${name} ${sha256(readFileSync(path))}`);
  }
  return sha256(lines.join("\n"));
}
