// HARNAIS D'INVARIANTS (D-102) — chaque oracle GATÉ confronté à un signal
// indépendant, sur les 24 documents du dépôt.
//
// POURQUOI CE HARNAIS EXISTE. Trois défauts d'oracle ont été trouvés — deux
// d'entre eux par des générations payées (P5, P6). Or il a été DÉMONTRÉ que
// celui de P6 était détectable ici, gratuitement : la requête « un écran
// destination de `navigation.primary` est-il déclaré mort ? » le révélait sur
// 2 documents sur 2, dont un présent au dépôt AVANT la génération.
//
// Les laboratoires écrits à la main partagent les angles morts des oracles :
// même auteur, même modèle mental. Les documents du corpus, eux, ont été
// écrits par un autre esprit et empruntent des chemins que je n'imagine pas.
// C'est ce que ce harnais interroge.
//
// Il ne teste PAS des mutations : il cherche des DÉSACCORDS entre ce qu'un
// oracle affirme et ce qu'une source indépendante dit du même fait.
const { readdirSync, readFileSync, existsSync } = await import("node:fs");
const { join } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const R = join(fileURLToPath(import.meta.url), "..", "..", "..", "..") + "/";

const { migrateAirDocument } = await import(R + "packages/air-schema/src/index.ts");
const { EXECUTION_ENVELOPE_V1: ENV, reachableScreens, controls, dataBindings } = await import(
  R + "packages/execution-contract/src/index.ts"
);
const { BLOCKS } = await import(R + "packages/blocks/src/definitions.ts");
/** Blocs dont le RUNTIME lit la prop `actionId` — dérivé, jamais recopié. */
const PAR_PROP = new Set(BLOCKS.filter((b) => b.actionRefProps.includes("actionId")).map((b) => b.id));
const { buildDemoFixtures } = await import(R + "packages/compiler/src/demo-fixtures.ts");

// Réimplémentation INDÉPENDANTE de l'atteignabilité, volontairement AVEUGLE à
// `navigation.primary` : c'est la logique d'avant D-099. Elle sert de témoin —
// R1 compare l'oracle à elle, et le contrôle négatif s'appuie dessus.
const atteignableSansOnglets = (air) => {
  const ids = new Set(air.screens.map((s) => s.id));
  const at = new Set([air.navigation.entryScreenId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of air.actions) {
      const t =
        a.effect.kind === "navigate"
          ? a.effect.screenId
          : a.effect.kind === "mutation"
            ? a.effect.thenScreenId
            : undefined;
      if (t === undefined || at.has(t) || !ids.has(t)) continue;
      // MÊME RÈGLE D'ORIGINE que l'oracle : sans elle le témoin est trop
      // permissif et signale des pertes imaginaires. Mesuré : 6 fausses
      // alertes, dont `scr_booking`, atteint depuis un écran mort.
      const origine =
        a.trigger.kind === "ui"
          ? air.screens.find((sc) => sc.blocks.some((b) => b.id === a.trigger.blockId))?.id
          : a.trigger.kind === "lifecycle"
            ? a.trigger.screenId
            : undefined;
      if (origine !== undefined && !at.has(origine)) continue;
      at.add(t);
      grew = true;
    }
  }
  return at;
};

const SOURCES = [
  ["v2", R + "packages/golden-corpus/corpus-v2/"],
  ["v3", R + "packages/golden-corpus/corpus-v3/"],
].filter(([, d]) => existsSync(d));

const documents = [];
for (const [v, dir] of SOURCES) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".air.json")).sort()) {
    const nom = `${v}/${f.replace(".air.json", "")}`;
    try {
      documents.push([nom, migrateAirDocument(JSON.parse(readFileSync(dir + f, "utf8")))]);
    } catch {
      documents.push([nom, null]); // invalide : compté, jamais ignoré en silence
    }
  }
}

const desaccords = [];
const note = (invariant, doc, detail) => desaccords.push({ invariant, doc, detail });

// ── reachableScreens × navigation déclarée ────────────────────────────────
const I_REACH = [
  [
    "R1 · l'oracle voit AU MOINS ce que voit le témoin aveugle aux onglets",
    (nom, air) => {
      // SIGNAL INDÉPENDANT : une réimplémentation qui ignore `navigation.primary`.
      // L'oracle doit être un SUR-ENSEMBLE d'elle. S'il en voit moins, il a
      // perdu un chemin ; s'il ne voit pas les onglets EN PLUS, D-099 a régressé.
      const vivants = new Set(reachableScreens(air, ENV.triggers));
      for (const s of atteignableSansOnglets(air)) {
        if (!vivants.has(s)) note("R1", nom, `${s} vu par le témoin, PERDU par l'oracle`);
      }
      if (air.navigation.primary === undefined) return;
      const ecran = new Map(air.navigation.routes.map((r) => [r.id, r.screenId]));
      for (const d of air.navigation.primary.destinations) {
        const s = ecran.get(d.routeId);
        if (s !== undefined && !vivants.has(s)) note("R1", nom, `${s} onglet mais DÉCLARÉ MORT`);
      }
    },
  ],
  [
    "R2 · l'écran d'entrée est ATTEIGNABLE",
    (nom, air) => {
      const vivants = new Set(reachableScreens(air, ENV.triggers));
      if (!vivants.has(air.navigation.entryScreenId)) note("R2", nom, air.navigation.entryScreenId);
    },
  ],
  [
    "R3 · tout écran ATTEIGNABLE a un chemin déclaré (entrée, onglet ou action)",
    (nom, air) => {
      const ecran = new Map(air.navigation.routes.map((r) => [r.id, r.screenId]));
      const racines = new Set([air.navigation.entryScreenId]);
      for (const d of air.navigation.primary?.destinations ?? []) {
        const s = ecran.get(d.routeId);
        if (s !== undefined) racines.add(s);
      }
      const cibles = new Set(
        air.actions
          .map((a) =>
            a.effect.kind === "navigate"
              ? a.effect.screenId
              : a.effect.kind === "mutation"
                ? a.effect.thenScreenId
                : undefined,
          )
          .filter((x) => x !== undefined),
      );
      for (const s of reachableScreens(air, ENV.triggers)) {
        if (!racines.has(s) && !cibles.has(s)) note("R3", nom, `${s} vivant SANS chemin déclaré`);
      }
    },
  ],
];

// ── controls × actions déclarées et enveloppe ─────────────────────────────
const AFFORDANCES = new Set(["button", "empty_state", "form", "list"]);
const I_CTRL = [
  [
    "C1 · `executed` IMPLIQUE l'appartenance à l'enveloppe",
    (nom, air) => {
      const eff = new Set(ENV.effects);
      const trg = new Set(ENV.triggers);
      const parId = new Map(air.actions.map((a) => [a.id, a]));
      for (const c of controls(air, ENV)) {
        const a = parId.get(c.actionId);
        if (a === undefined) continue;
        // D-105 — IMPLICATION, non plus équivalence. `executed` exige désormais
        // AUSSI un dispatch réel : exiger l'équivalence reviendrait à réencoder
        // l'ancienne définition, celle qui déclarait exécutées 17 actions mortes.
        // Ce qui doit rester vrai : rien hors enveloppe n'est jamais exécuté.
        const dansEnveloppe = eff.has(a.effect.kind) && trg.has(a.trigger.kind);
        if (c.executed && !dansEnveloppe) {
          note("C1", nom, `${c.actionId} exécutée HORS enveloppe`);
        }
      }
    },
  ],
  [
    "C2 · aucune action `ui` liée à un bloc n'échappe à l'oracle",
    (nom, air) => {
      const vus = new Set(controls(air, ENV).map((c) => c.actionId));
      const blocs = new Map(air.screens.flatMap((s) => s.blocks.map((b) => [b.id, b])));
      for (const a of air.actions) {
        if (a.trigger.kind !== "ui") continue;
        const b = blocs.get(a.trigger.blockId);
        if (b === undefined) continue;
        if (!vus.has(a.id)) {
          note("C2", nom, `${a.id} déclenchée par ${b.blockType} ${b.id} — INVISIBLE à controls()`);
        }
      }
    },
  ],
];

// ── C3 A ÉTÉ RETIRÉ — ÉDITION CONSCIENTE, ET VOICI POURQUOI.
//
// Il a rempli sa fonction : il a révélé que `controls()` déclarait `executed`
// 17 actions que le runtime ne dispatche jamais — `button` et `empty_state`
// lisent leur prop `actionId`, jamais le déclencheur. Faux vert contaminant F1.
//
// Depuis D-105, `controls()` DÉRIVE cette même règle. C3 réénumérerait donc la
// logique qu'il prétend vérifier : une TAUTOLOGIE, incapable de voir sa propre
// violation — son contrôle négatif l'a démontré, exactement comme pour D2.
//
// La vérification INDÉPENDANTE existe ailleurs, et elle est plus forte :
// `gate:controles` MONTE chaque application émise, presse chaque élément
// pressable et observe si quelque chose se produit. Si `controls()` mentait de
// nouveau, l'observation le contredirait — sans partager une ligne de code.
const I_DISPATCH = [];

// ── dataBindings × datasets déclarés ──────────────────────────────────────
// D2 A ÉTÉ RETIRÉ (édition consciente). Il affirmait « tout bloc lié est
// recensé » en réénumérant EXACTEMENT la source que `dataBindings` parcourt :
// une tautologie, incapable de voir sa propre violation. Son contrôle négatif
// l'a démontré. Un invariant qui ne peut pas échouer n'est pas un invariant.
const I_DATA = [
  [
    "D1 · `seeded` équivaut aux LIGNES RÉELLEMENT produites par le compilateur",
    (nom, air) => {
      // SIGNAL INDÉPENDANT : `buildDemoFixtures` est ce que le projet émis
      // contiendra vraiment. `dataBindings` lit `rowCount`, une DÉCLARATION.
      // Le désaccord entre les deux serait une entité dite alimentée que
      // l'application ne peuplerait jamais — ou l'inverse.
      let fixtures;
      try {
        fixtures = buildDemoFixtures(air);
      } catch {
        note("D1", nom, "fixtures non calculables");
        return;
      }
      for (const b of dataBindings(air)) {
        const reelles = (fixtures[b.entityId] ?? []).length;
        if (b.seeded !== reelles > 0) {
          note("D1", nom, `${b.entityId} seeded=${b.seeded} mais ${reelles} ligne(s) émise(s)`);
        }
      }
    },
  ],
];

console.log("═".repeat(88));
console.log("HARNAIS D'INVARIANTS — 3 oracles GATÉS × " + documents.length + " documents");
console.log("═".repeat(88));

let invalides = 0;
for (const [nom, air] of documents) {
  if (air === null) {
    invalides++;
    console.log(`  ⚪ ${nom} — document invalide, non interrogeable`);
    continue;
  }
  for (const [, fn] of [...I_REACH, ...I_CTRL, ...I_DISPATCH, ...I_DATA]) fn(nom, air);
}

for (const [titre] of [...I_REACH, ...I_CTRL, ...I_DISPATCH, ...I_DATA]) {
  const code = titre.split(" ")[0];
  const n = desaccords.filter((d) => d.invariant === code).length;
  console.log(`  ${n === 0 ? "🟢" : "🔴"} ${titre.padEnd(66)} ${n === 0 ? "0 désaccord" : n + " DÉSACCORD(S)"}`);
}
if (desaccords.length > 0) {
  console.log("\n  détail :");
  for (const d of desaccords) console.log(`     🔴 [${d.invariant}] ${d.doc} — ${d.detail}`);
}
console.log(
  `\n  ${documents.length - invalides} document(s) interrogés · ${invalides} invalide(s) · ` +
    `${desaccords.length} désaccord(s)`,
);

// ── CONTRÔLES NÉGATIFS — sans eux, « 0 désaccord » ne prouverait RIEN.
//
// Chaque invariant est confronté à un document DÉLIBÉRÉMENT fautif, dérivé
// d'un document réel. Un invariant incapable de voir sa propre violation est
// un invariant décoratif.
console.log("\n" + "─".repeat(88));
console.log("CONTRÔLES NÉGATIFS — chaque invariant doit VOIR sa propre violation");
console.log("─".repeat(88));

const sain = documents.find(([, a]) => a !== null && a.navigation.primary !== undefined);
if (sain === undefined) {
  console.log("  🔴 aucun document porteur de navigation primaire : contrôles impossibles");
  process.exitCode = 1;
} else {
  const [, modele] = sain;
  const essai = (code, titre, mut) => {
    const avant = desaccords.length;
    const doc = structuredClone(modele);
    mut(doc);
    for (const [, fn] of [...I_REACH, ...I_CTRL, ...I_DISPATCH, ...I_DATA]) {
      try {
        fn("<contrôle négatif>", doc);
      } catch {
        /* une violation peut casser une autre lecture : sans importance ici */
      }
    }
    const vus = desaccords.slice(avant).filter((d) => d.invariant === code).length;
    desaccords.length = avant; // on ne pollue pas le verdict réel
    console.log(`  ${vus > 0 ? "🟢 VU  " : "🔴 AVEUGLE"} ${code} · ${titre}`);
    return vus > 0;
  };

  const ok = [
    // R1 compare l'oracle à un témoin. Sa violation ne peut pas être produite
    // en mutant le DOCUMENT — retirer un onglet le retire des deux côtés. Ce
    // qui doit être prouvé, c'est que la COMPARAISON est vivante : on rejoue
    // le témoin NAÏF (sans règle d'origine), qui sur-estime, et R1 doit crier.
    // Mesuré lors de la mise au point : 6 désaccords, dont `scr_booking`.
    (() => {
      const avant = desaccords.length;
      for (const [nom, air] of documents) {
        if (air === null) continue;
        const vivants = new Set(reachableScreens(air, ENV.triggers));
        const naif = new Set([air.navigation.entryScreenId]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const a of air.actions) {
            const t =
              a.effect.kind === "navigate"
                ? a.effect.screenId
                : a.effect.kind === "mutation"
                  ? a.effect.thenScreenId
                  : undefined;
            if (t === undefined || naif.has(t)) continue;
            naif.add(t);
            grew = true;
          }
        }
        for (const sc of naif) if (!vivants.has(sc)) note("R1", nom, sc);
      }
      const vus = desaccords.length - avant;
      desaccords.length = avant;
      console.log(`  ${vus > 0 ? "🟢 VU  " : "🔴 AVEUGLE"} R1 · la comparaison oracle × témoin est VIVANTE (${vus} écart(s) sur témoin naïf)`);
      return vus > 0;
    })(),
    essai("R2", "un écran d'entrée absent des écrans", (d) => {
      d.navigation.entryScreenId = "scr_inexistant_controle";
    }),
    essai("C2", "une action `ui` sur un bloc HORS liste d'affordances", (d) => {
      const header = d.screens.flatMap((s) => s.blocks).find((b) => b.blockType === "header");
      if (header === undefined) return;
      d.actions = [
        ...d.actions,
        {
          id: "act_controle_negatif",
          trigger: { kind: "ui", blockId: header.id },
          effect: { kind: "navigate", screenId: d.navigation.entryScreenId },
        },
      ];
    }),
    essai("D1", "`rowCount` ment : déclaré alimenté, aucune ligne émise", (d) => {
      // `dataBindings` lit la DÉCLARATION, `buildDemoFixtures` produit le RÉEL.
      // On déclare des lignes pour une entité que le compilateur ne peuplera pas.
      d.datasets = [
        ...d.datasets,
        { id: "data_controle_negatif", entityId: "ent_inexistante_controle", rowCount: 5 },
      ];
      const s0 = d.screens[0];
      s0.blocks = [
        ...s0.blocks,
        {
          id: "blk_controle_negatif",
          blockType: "list",
          entityId: "ent_inexistante_controle",
          props: [],
        },
      ];
    }),
  ];
  const vus = ok.filter(Boolean).length;
  console.log(`\n  ${vus}/${ok.length} invariants ont VU leur violation`);
  if (vus < ok.length) process.exitCode = 1;
}

if (desaccords.length > 0) process.exitCode = 1;
