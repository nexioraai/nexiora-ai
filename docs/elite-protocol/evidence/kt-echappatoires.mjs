// LABORATOIRE D'ÉCHAPPATOIRES (D-088) — sans API, documents en mémoire.
//
// Une garantie qu'on n'a pas cherché à contourner n'est pas une garantie.
// Chaque scénario simule une façon RÉELLE de faire disparaître un diagnostic
// au lieu de satisfaire l'intention, et exige que le système la refuse.
const { readFileSync } = await import("node:fs");
const { join } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const R = join(fileURLToPath(import.meta.url), "..", "..", "..", "..") + "/";

const { amputationsHorsPerimetre, mutationsHorsPerimetre } = await import(
  R + "packages/repair/src/repair-scope.ts"
);
const { refuteUnexpressibleReason } = await import(R + "packages/fidelity/src/intent.ts");
const { validateAirIntentRequirement } = await import(R + "packages/air-schema/src/validate.ts");
const { EXECUTION_ENVELOPE_V1: ENV } = await import(R + "packages/execution-contract/src/envelope.ts");

const BASE = JSON.parse(
  readFileSync(R + "packages/golden-corpus/corpus-v3/plombier-urgence.air.json", "utf8"),
);
// Le diagnostic qui a réellement déclenché l'amputation observée.
const DIAG = [
  {
    code: "AIR_IMAGE_ORPHELINE",
    // D-093 : le CHEMIN doit résoudre dans le document. Ce laboratoire portait
    // un chemin inventé (`entities[3].fields[1]` = `fld_demande_titre`) que
    // l'ancienne règle textuelle tolérait parce que le MESSAGE nommait la photo.
    // Le chemin réel de `fld_photo_fichier` est `entities[4].fields[0]`.
    path: "entities[4].fields[0]",
    message: '"fld_photo_fichier" est déclaré et montré par aucun bloc',
  },
];

// Le refus complet : nœud RETIRÉ **ou** nœud DÉNATURÉ.
const amputation = (mut) => {
  const apres = structuredClone(BASE);
  mut(apres);
  return [
    ...amputationsHorsPerimetre(BASE, apres, DIAG),
    ...mutationsHorsPerimetre(BASE, apres, DIAG).map((m) => `${m.id}:${m.avant}→${m.apres}`),
  ];
};

const CAS = [
  [
    "① supprimer un champ `asset` que le diagnostic ne nomme pas",
    () => amputation((d) => {
      const e = d.entities.find((x) => x.fields.some((f) => f.type === "asset" && f.id !== "fld_photo_fichier"));
      e.fields = e.fields.filter((f) => f.type !== "asset");
    }),
  ],
  ["② supprimer une ENTITÉ", () => amputation((d) => { d.entities = d.entities.slice(1); })],
  ["③ supprimer une ACTION", () => amputation((d) => { d.actions = d.actions.slice(1); })],
  ["④ supprimer un ÉCRAN", () => amputation((d) => { d.screens = d.screens.slice(1); })],
  ["⑤ supprimer un BLOC", () => amputation((d) => { d.screens[0].blocks = d.screens[0].blocks.slice(1); })],
  ["⑥ supprimer une PROMESSE (expectedTests)", () => amputation((d) => { d.expectedTests = d.expectedTests.slice(1); })],
  ["⑦ supprimer un BESOIN de intent.needs", () => amputation((d) => { d.intent.needs = d.intent.needs.slice(1); })],
  [
    "⑧ remodeler : renommer une entité (même contenu, autre id)",
    () => amputation((d) => { d.entities[0].id = "ent_renommee_pour_contourner"; }),
  ],
  [
    "⑨ motif d'inexprimabilité artificiel (aucun fait cité)",
    () => (refuteUnexpressibleReason("ce besoin dépasse les capacités actuelles", ENV) ? ["refusé"] : []),
  ],
  [
    "⑩ motif invoquant une capacité qui EXISTE",
    () => (refuteUnexpressibleReason("imageRendering ne le permet pas", ENV) ? ["refusé"] : []),
  ],
  [
    "⑪ retirer la section intent en entier",
    () => (validateAirIntentRequirement({ ...BASE, intent: undefined }).length > 0 ? ["refusé"] : []),
  ],
  // ── APRÈS CORRECTIONS (D-089) : les échappatoires plus fines.
  [
    "⑫ motif VRAI mais causalement FAUX (image ← capabilitiesEmitCode)",
    () =>
      refuteUnexpressibleReason(
        "capabilitiesEmitCode: false",
        ENV,
        "Les photos doivent être visibles sur la fiche.",
      )
        ? ["refusé"]
        : [],
  ],
  [
    "⑬ capacité EXISTANTE déclarée indisponible (recherche)",
    () =>
      refuteUnexpressibleReason("le registre n'offre pas de recherche", ENV, "Rechercher un service.")
        ? ["refusé"]
        : [],
  ],
  [
    "⑭ changer le TYPE d'un champ asset pour le soustraire au contrôle",
    () =>
      amputation((d) => {
        for (const e of d.entities) {
          for (const f of e.fields) if (f.type === "asset") f.type = "string";
        }
      }),
  ],
  [
    // Ici le nœud SURVIT : ce n'est pas une amputation, c'est un changement de
    // résolution. Le garde compétent est D2, pas le comparateur de nœuds.
    "⑮ basculer un besoin SATISFAIT vers inexprimable",
    () => (refuteUnexpressibleReason("x", ENV, BASE.intent.needs[0].statement) ? ["refusé"] : []),
  ],
  [
    "⑯ remplacer une action par une autre, plus facile",
    () => amputation((d) => { d.actions[0] = { ...d.actions[0], id: "act_plus_facile" }; }),
  ],
  [
    "⑰ déplacer un besoin vers une section non réémise",
    () => amputation((d) => { d.intent.needs = d.intent.needs.filter((n) => !n.id.includes("photo")); }),
  ],
];

console.log("  " + "échappatoire".padEnd(58) + "détectée ?");
console.log("  " + "─".repeat(84));
let detectees = 0;
for (const [nom, essai] of CAS) {
  const r = essai();
  const ok = r.length > 0;
  if (ok) detectees++;
  console.log(`  ${nom.padEnd(58)}${ok ? "🟢 REFUSÉE" : "🔴 PASSE"}   ${ok ? r.slice(0, 2).join(", ") : ""}`);
}

// ── CONTRÔLE POSITIF — sans lui, « tout refuser » suffirait à verdir.
console.log("\n  " + "contrôle positif (doit PASSER)".padEnd(58) + "résultat");
console.log("  " + "─".repeat(84));
const positifs = [
  [
    "🟢 ENRICHIR : ajouter un écran sans rien retirer",
    // Les blocs clonés reçoivent de NOUVEAUX identifiants : cloner un écran en
    // conservant les identifiants de ses blocs produirait des doublons, ce qui
    // est invalide en soi. Le garde avait raison de refuser la version naïve.
    () =>
      amputation((d) => {
        const copie = structuredClone(d.screens[0]);
        copie.id = "scr_ajoute";
        copie.blocks = copie.blocks.map((b, i) => ({ ...b, id: `blk_ajoute_${String(i)}` }));
        d.screens.push(copie);
      }),
  ],
  [
    "🟢 SUPPRIMER CE QUE LE DIAGNOSTIC NOMME",
    () => amputation((d) => {
      const e = d.entities.find((x) => x.fields.some((f) => f.id === "fld_photo_fichier"));
      e.fields = e.fields.filter((f) => f.id !== "fld_photo_fichier");
    }),
  ],
  [
    "🟢 MOTIF HONNÊTE citant un fait réellement faux",
    () => (refuteUnexpressibleReason("capabilitiesEmitCode: false — aucune prise de vue", ENV) ? ["refusé"] : []),
  ],
];
let positifsOk = 0;
for (const [nom, essai] of positifs) {
  const r = essai();
  const ok = r.length === 0;
  if (ok) positifsOk++;
  console.log(`  ${nom.padEnd(58)}${ok ? "✅ passe" : "🔴 REFUSÉ À TORT : " + r.join(", ")}`);
}

console.log(
  `\n  ${detectees}/${CAS.length} échappatoires refusées · ${positifsOk}/${positifs.length} contrôles positifs`,
);
process.exitCode = detectees === CAS.length && positifsOk === positifs.length ? 0 : 1;
