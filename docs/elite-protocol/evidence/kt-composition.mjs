// CAS-TUEURS DE gate:composition — sans API.
//
// D-088 · D7 — CE FICHIER A ÉTÉ RÉÉCRIT. Il éprouvait un « cliquet
// anti-déplacement » qui comparait un document à une génération ANTÉRIEURE.
// Ce comparateur est retiré : `emit-v3.mjs` ne relit jamais le corpus (un seul
// `readFileSync`, sur `.env.local`), donc deux générations ne sont pas
// comparables, et le cliquet punissait des remodélisations légitimes.
//
// La garantie anti-amputation vit désormais là où elle est FONDÉE :
//   · `packages/repair/tests/repair-scope.test.ts` — attempt 1 vs attempt 2 ;
//   · `gate:fidelite` — un besoin écarté sur un motif réfuté.
//
// Ce qui est éprouvé ICI est la seule propriété que cette gate mesure encore :
// le nombre d'images orphelines ne doit jamais AUGMENTER.
const { readFileSync, writeFileSync, copyFileSync } = await import("node:fs");
const { join } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const { execFileSync } = await import("node:child_process");
const { tmpdir } = await import("node:os");
const R = join(fileURLToPath(import.meta.url), "..", "..", "..", "..") + "/";

const DOC = R + "packages/golden-corpus/corpus-v3/resto-quartier.air.json";
const SAUVE = join(tmpdir(), "kt-composition-sauvegarde.json");
copyFileSync(DOC, SAUVE);

// On compare les MESURES, pas le code de sortie. Le corpus contient
// aujourd'hui un document réellement invalide (`coach-fitness`), donc la gate
// est rouge en permanence : un cas-tueur qui ne lirait que le code de sortie
// ne discriminerait plus rien. Un cliquet doit rester discriminant même quand
// l'état de départ est déjà fautif.
const mesurer = () => {
  let sortie = "";
  try {
    sortie = String(
      execFileSync("node", [R + "docs/elite-protocol/evidence/gate-composition.mjs"], {
        stdio: "pipe",
        timeout: 300000,
      }),
    );
  } catch (e) {
    sortie = String(e.stdout ?? "");
  }
  return {
    orphelines: Number(/images ORPHELINES : (\d+)/.exec(sortie)?.[1] ?? -1),
    invalides: Number(/documents INVALIDES : (\d+)/.exec(sortie)?.[1] ?? -1),
  };
};

const muter = (fn) => {
  const doc = JSON.parse(readFileSync(SAUVE, "utf8"));
  fn(doc);
  writeFileSync(DOC, JSON.stringify(doc, null, 2) + "\n");
};

const CAS = [
  ["① ÉTAT SAIN (contrôle positif) — la mesure ne bouge pas", () => {}, "identique"],
  [
    "② l'affichage d'une image est RETIRÉ",
    (d) => {
      for (const s2 of d.screens) {
        for (const b of s2.blocks) {
          if (b.props) b.props = b.props.filter((p) => p.key !== "imageFieldId");
        }
      }
    },
    "pire",
  ],
  [
    "③ une image est AJOUTÉE sans être montrée",
    (d) => {
      const aff = new Set(d.screens.flatMap((s2) => s2.blocks).map((b) => b.entityId).filter(Boolean));
      const e = d.entities.find((x) => aff.has(x.id));
      e.fields.push({ id: "fld_kt_orpheline", name: { fr: "x" }, type: "asset", required: false });
    },
    "pire",
  ],
];

muter(() => {});
const REF = mesurer();
console.log(`  référence : ${REF.orphelines} orphelines · ${REF.invalides} invalide(s)\n`);
console.log("  " + "scénario".padEnd(50) + "mesure              attendu");
console.log("  " + "─".repeat(84));
let ok = 0;
for (const [nom, mut, attendu] of CAS) {
  muter(mut);
  const m = mesurer();
  const pire = m.orphelines > REF.orphelines || m.invalides > REF.invalides;
  const identique = m.orphelines === REF.orphelines && m.invalides === REF.invalides;
  const bon = attendu === "pire" ? pire : identique;
  if (bon) ok++;
  console.log(
    `  ${nom.padEnd(50)}${`${m.orphelines} orph · ${m.invalides} inval`.padEnd(20)}` +
      `${attendu.padEnd(10)}${bon ? "✅" : "🔴 INATTENDU"}`,
  );
}
copyFileSync(SAUVE, DOC);
const restaure = readFileSync(DOC, "utf8") === readFileSync(SAUVE, "utf8");
console.log(`\n  ${ok}/${CAS.length} conformes · document restauré : ${restaure ? "✅" : "🔴"}`);
console.log(
  "\n  NOTE : la gate est rouge en permanence tant que `coach-fitness` est invalide.\n" +
    "  Ce n'est pas un défaut du cliquet — c'est un défaut RÉEL du corpus, non masqué.",
);
process.exitCode = ok === CAS.length && restaure ? 0 : 1;
