import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// ============================================================
// Audit hostile rate-limit/idempotence CJ, Phase 6-7 : garde structurelle
// exécutée par la suite de tests (donc par la CI, à chaque PR) empêchant
// qu'un futur développeur réintroduise -- accidentellement ou non -- un
// second chemin de création de commande CJ. cj-adapter.ts:createOrder() a
// été neutralisé (lève une erreur), mais rien n'empêchait *structurellement*
// un nouveau fichier d'importer et d'appeler cjCreateOrder() directement.
// Ce test scanne le code source réel (pas une supposition) et échoue si
// l'identifiant apparaît ailleurs que dans les deux seuls emplacements
// légitimes : sa définition (client.ts) et son unique appelant (fulfill.ts).
// ============================================================

const SRC_ROOT = join(process.cwd(), 'src');
const ALLOWED_FILES = new Set([
  'src/lib/cj/client.ts',   // définition + export
  'src/lib/cj/fulfill.ts',  // seul appelant réel autorisé (claim + réconciliation)
]);
const IDENTIFIER = /\bcjCreateOrder\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('cjCreateOrder — un seul chemin de création CJ (garde structurelle CI)', () => {
  it("n'apparaît nulle part hors de client.ts (définition) et fulfill.ts (seul appelant)", () => {
    const files = walk(SRC_ROOT);
    const violations: string[] = [];
    for (const f of files) {
      const rel = relative(process.cwd(), f).split('\\').join('/');
      if (ALLOWED_FILES.has(rel)) continue;
      const content = readFileSync(f, 'utf8');
      if (IDENTIFIER.test(content)) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });

  it('les deux emplacements autorisés existent bien réellement (le test lui-même n\'est pas silencieusement vide)', () => {
    const clientContent = readFileSync(join(process.cwd(), 'src/lib/cj/client.ts'), 'utf8');
    const fulfillContent = readFileSync(join(process.cwd(), 'src/lib/cj/fulfill.ts'), 'utf8');
    expect(IDENTIFIER.test(clientContent)).toBe(true);
    expect(IDENTIFIER.test(fulfillContent)).toBe(true);
  });
});
