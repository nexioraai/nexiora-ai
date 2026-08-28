// V4 B-NAV — CRITÈRE 1 : byte-stabilité de la sortie générée.
// 10 invocations de processus × 2 environnements (patron V2 : TZ
// Pacific/Auckland + locale turque + cwd différent) par candidat.
// Attendu : 20/20 hash racine identiques PAR candidat.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(HERE, "results"), { recursive: true });
const log = join(HERE, "results", "v4-stability.jsonl");

const ENVS = {
  A: { ...process.env },
  B: {
    ...process.env,
    TZ: "Pacific/Auckland",
    LANG: "tr_TR.UTF-8",
    LC_ALL: "tr_TR.UTF-8",
  },
};
const CWDS = { A: HERE, B: tmpdir() };

let allOk = true;
for (const gen of ["gen-react-navigation.mjs", "gen-expo-router.mjs"]) {
  const roots = new Set();
  for (const envName of ["A", "B"]) {
    for (let run = 1; run <= 10; run++) {
      const out = execFileSync(process.execPath, [join(HERE, gen)], {
        env: ENVS[envName],
        cwd: CWDS[envName],
        encoding: "utf8",
      });
      const { candidate, root, fileCount } = JSON.parse(out.trim());
      roots.add(root);
      appendFileSync(
        log,
        JSON.stringify({ candidate, envName, run, fileCount, root }) + "\n",
      );
    }
  }
  const verdict =
    roots.size === 1 ? "IDENTIQUE 20/20" : `DIVERGENCE (${roots.size})`;
  appendFileSync(log, JSON.stringify({ gen, verdict, distinct: [...roots] }) + "\n");
  console.log(gen, verdict);
  if (roots.size !== 1) allOk = false;
}
process.exitCode = allOk ? 0 : 1;
