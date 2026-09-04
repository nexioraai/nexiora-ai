// GATE DE COUVERTURE DEMANDE → AIR — PHASE 10B, critère F4.
//
// Fait fondateur (`APP-D004`) : *« menu avec photos »* est entré dans un prompt
// et a disparu — dans 12 documents sur 13, sans une trace. Non pas parce que
// personne ne regardait, mais parce que **le manque était structurellement
// indicible** : `expectedTests.targetId` doit désigner un nœud EXISTANT, donc un
// besoin sans nœud ne pouvait pas être exprimé.
//
// `intent.needs[].resolution` referme cette issue. Un besoin est soit rattaché à
// des nœuds, soit déclaré inexprimable AVEC MOTIF. L'absence silencieuse n'est
// plus une option offerte par le contrat.
//
// 🔴 RÉSIDU DÉCLARÉ, non couvert par cet instrument : un besoin que l'émetteur
// n'a JAMAIS ÉNUMÉRÉ reste invisible ici. C'est pourquoi `intent.request`
// conserve la demande VERBATIM — le matériau du contrôle qui manque encore.
import type { ProjectAir } from "@deribfy/air-schema";
import {
  type ExecutionEnvelope,
  controls,
  dataBindings,
  reachableScreens,
} from "@deribfy/execution-contract";

export type NeedState =
  /** Rattaché à des nœuds qui existent ET qui fonctionnent. */
  | "satisfait"
  /** Rattaché à des nœuds qui existent mais NE FONCTIONNENT PAS. */
  | "satisfait_par_du_mort"
  /** Rattaché à des nœuds qui n'existent pas dans le document. */
  | "reference_brisee"
  /** Déclaré hors de portée du moteur, avec un motif VÉRIFIÉ. Ne fait pas échouer. */
  | "inexprimable"
  /** Déclaré hors de portée, mais le motif ne tient pas devant l'enveloppe. */
  | "motif_refute"
  /** Déclaré satisfait, mais le document ne porte AUCUNE trace du mécanisme. */
  | "satisfaction_non_prouvee";

export interface NeedVerdict {
  readonly needId: string;
  readonly statement: string;
  readonly state: NeedState;
  readonly motif: string;
}

export interface IntentReport {
  /** Le document conserve-t-il seulement la demande qui l'a produit ? */
  readonly present: boolean;
  readonly verdicts: readonly NeedVerdict[];
  readonly satisfaits: number;
  readonly inexprimables: number;
  readonly defaillants: number;
  readonly limites: readonly string[];
  readonly passed: boolean;
  readonly failures: readonly string[];
}

const LIMITES: readonly string[] = [
  "Un besoin JAMAIS ÉNUMÉRÉ par l'émetteur reste invisible : cet instrument lit `needs`, il ne relit pas `request`.",
  "Un nœud « vivant » signifie atteignable / exécuté / alimenté — pas que son comportement soit correct.",
  "Le motif d'un besoin inexprimable est confronté à l'enveloppe, jamais au monde : il prouve que le MOTEUR ne sait pas faire, jamais que la chose serait impossible.",
  "La pertinence du motif est jugée par classification lexicale — sujet ET verbe de restitution : un besoin formulé sans aucun des termes reconnus échappe à ce contrôle.",
];

// ══════════════════════════════════════════════════════════════════════════
// D-088 · D2 — « MONTRE-MOI LE FAIT. »
//
// CAUSE RACINE : `unexpressible` acceptait N'IMPORTE QUELLE chaîne non vide.
// Mesuré sur le corpus : 45 besoins sur 130 écartés ainsi, dont 19 au motif
// que « le registre de blocs fermé ne sait afficher aucune image » — affirmation
// FAUSSE depuis que le registre porte `imageFieldId`. Un besoin réellement
// exprimable disparaissait donc sur une simple phrase du modèle.
//
// Un motif doit désormais CITER un fait de l'enveloppe, et ce fait doit TENIR.
// L'enveloppe est la seule source de vérité admise : elle est déjà le contrat
// qui dit ce que le moteur exécute, et elle est elle-même sous cliquet de
// véracité. Aucune deuxième source n'est créée.
//
// Deux refus SÉPARÉS, parce qu'ils se contournent différemment :
//  · AUCUN fait cité      → le motif est une opinion, pas une preuve ;
//  · fait cité mais VRAI  → le motif invoque une capacité qui EXISTE.
// ══════════════════════════════════════════════════════════════════════════

/** Faits booléens de l'enveloppe qu'un motif peut citer, par leur nom exact. */
const FAITS_BOOLEENS = [
  "capabilitiesEmitCode",
  // AJOUT 2026-09-04 : sans ce fait, une inexprimabilité RÉELLE (agenda par
  // jour) n'était démontrable par aucun motif — le document restait rouge sans
  // recours. Voir `envelope.ts`.
  "listGrouping",
  "slotsInvoked",
  "rulesEnforced",
  "relationTraversal",
  "listFiltering",
  "rtlFlagEffective",
  "themeNameEffective",
  "crossScreenFormState",
  "imageRendering",
  "listSearch",
  // E1/E2 (D-129) — citables dans un motif dès leur naissance (à `false`,
  // un motif qui les cite TIENT ; à `true`, il sera réfuté — automatique).
  "listUserFiltering",
  "relationScoping",
  "liveData",
  "primaryNavigation",
] as const;

// ── D-089 · CAUSALITÉ DU MOTIF.
//
// D2 vérifiait que le fait cité TIENT. Il ne vérifiait pas qu'il soit
// PERTINENT. Trou mesuré : un besoin d'image écarté au motif
// `capabilitiesEmitCode: false` passait — fait vrai, cause fausse.
//
// La classification ci-dessous ne juge pas le monde : elle décide si le SUJET
// d'un besoin tombe dans une capacité que l'enveloppe déclare ✅. Deux familles
// de verbes, mesurées sur des besoins RÉELS du corpus :
//
//   ACQUÉRIR   « joindre des photos (prise de vue ou import) »  → exige un
//              effet `capability` que le moteur n'exécute pas. LÉGITIME.
//   RESTITUER  « les photos jointes doivent être visibles »     → n'exige que
//              l'affichage, que le moteur SAIT faire. ABUSIF.
//
// C'est très exactement la paire trouvée dans `plombier-urgence`, et la
// distinction que le motif unique confondait.

// ── D-097 · LES FRONTIÈRES DE MOT SONT ASCII, LE CORPUS EST FRANÇAIS.
//
// CAUSE RACINE MESURÉE : `\b` s'appuie sur `\w`, qui ne contient AUCUNE lettre
// accentuée. `/\bclichés?\b/i` ne reconnaît donc PAS « cliché » — la position
// après « é » n'est pas une frontière, les deux côtés étant non-mots. Le même
// défaut frappait « apparaît » et « présenté ». Un classifieur écrit pour du
// français, avec des frontières ASCII, rate silencieusement ses propres termes.
//
// `motif()` construit des frontières conscientes d'Unicode. Les listes ci-dessous
// s'écrivent donc en texte, jamais en littéraux d'expression régulière.
const motif = (source: string): RegExp => new RegExp(`(?<!\\p{L})(?:${source})(?!\\p{L})`, "iu");
// Les suffixes s'écrivent `\\p{L}*` et JAMAIS `\\w*` : `\\w` est ASCII, il
// s'arrête avant l'accent. Mesuré : « filtrée » échappait parce que `filtr\\w*`
// consommait « filtre » puis butait sur « é », faisant échouer la frontière.

/** Sujets qui relèvent d'une capacité déclarée par l'enveloppe. */
const SUJETS_PAR_FAIT: Readonly<Record<string, readonly RegExp[]>> = {
  // D-096 — SYNONYMES MESURÉS. Le laboratoire adversarial a montré que
  // « cliché », « miniature » et « thumbnail » échappaient : trois termes de
  // haute précision, sans autre sens dans ce domaine.
  imageRendering: [
    motif("photos?"),
    motif("images?"),
    motif("visuels?"),
    motif("vignettes?"),
    motif("illustrations?"),
    motif("clichés?"),
    motif("miniatures?"),
    motif("thumbnails?"),
    // D-098 — « couverture » et « aperçu » désignent un artefact image. Risque
    // de faux positif MESURÉ, non supposé : les 7 occurrences des 24 documents
    // sont toutes des champs `asset` ou des besoins d'affichage. Sans elles,
    // « afficher une couverture vidéo » n'avait aucun sujet reconnaissable.
    motif("couvertures?"),
    motif("aperçus?"),
  ],
  listSearch: [motif("recherch\\p{L}*"), motif("cherch\\p{L}*"), motif("trouver"), motif("filtr\\p{L}*")],
  // E1 (D-129) — sujets de HAUTE PRÉCISION seulement : « critères » et
  // « multicritère » n'ont pas d'autre sens dans ce domaine. Les périphrases
  // relationnelles (« les X de ce Y ») sont indécidables proprement : la
  // portée relationnelle n'a PAS de sujets ici — sa trace reste vérifiable
  // (TRACE_ATTENDUE) et le contrôle d'acceptation garde le reste (D-126 §7).
  listUserFiltering: [motif("critères?"), motif("multicritères?")],
  // E3.2 (D-130) — haute précision : « temps réel », « en direct », « live ».
  liveData: [motif("temps réel"), motif("en direct"), motif("live")],
  primaryNavigation: [motif("onglets?"), motif("barre de navigation")],
};

/**
 * D-094 — LE SUJET NE SUFFIT PAS : IL FAUT LE VERBE DE RESTITUTION.
 *
 * Trouvé en cherchant, ailleurs, la classe d'erreur révélée par P5 : un garde
 * qui refuse une chose légitime parce qu'il interprète trop largement.
 * MESURÉ — « le client peut SUPPRIMER une photo », « chaque photo est
 * HORODATÉE », « le plombier ARCHIVE les photos » étaient tous classés comme
 * relevant de `imageRendering`. Aucun n'exige d'AFFICHER quoi que ce soit :
 * exiger d'eux une trace d'`imageFieldId`, ou leur refuser un motif, était un
 * faux positif de la même famille.
 *
 * `listSearch` et `primaryNavigation` n'ont pas besoin de cette liste : leurs
 * marqueurs de sujet SONT déjà des verbes d'action (« rechercher », « filtrer »).
 * Seul l'affichage d'image a un sujet nommable sans être invoqué.
 */
const RESTITUTION: readonly RegExp[] = [
  motif("visibles?"),
  // D-096 — CONJUGAISONS. `\bvoir\b` manquait « voient », « voit », « vu » :
  // « les clients VOIENT le menu avec les photos » échappait au contrôle.
  motif("vo(?:ir|it|ient|yez)"),
  motif("vus?"),
  motif("affich\\p{L}*"),
  motif("montr\\p{L}*"),
  motif("apparaît\\p{L}*"),
  motif("apparaiss\\p{L}*"),
  motif("consulter"),
  motif("aperçu"),
  motif("illustr\\p{L}*"),
  motif("vignettes?"),
  motif("prévisualis\\p{L}*"),
  // D-096 — « présenter » au sens de MONTRER. Mesuré sur les 24 documents :
  // une seule occurrence combine ce verbe et un sujet image, et c'est bien un
  // besoin d'affichage. Le risque de faux positif est donc mesuré, pas supposé.
  motif("présent(?:e|es|é|ée|és|ées|er|ant)"),
];

/** Capacités dont le sujet ne suffit pas : le besoin doit invoquer la restitution. */
const EXIGE_RESTITUTION: ReadonlySet<string> = new Set(["imageRendering"]);

/**
 * Verbes d'ACQUISITION : le besoin exige de PRODUIRE la donnée par un organe
 * de l'appareil, pas de la restituer. L'enveloppe ne couvre pas cela
 * (`capabilitiesEmitCode: false`), donc le sujet ne suffit pas à réfuter.
 */
const ACQUISITION: readonly RegExp[] = [
  motif("joindre"),
  motif("prise de vue"),
  // Mesuré : « Prendre ou choisir la photo du chien depuis l'appareil » est une
  // ACQUISITION, et un marqueur trop étroit (« prendre une photo ») la manquait,
  // faisant passer un besoin légitime pour un abus. Le marqueur porte donc sur
  // le verbe ET son objet, à courte distance.
  motif("prendre[^.;]{0,40}photos?"),
  motif("choisir[^.;]{0,40}photos?"),
  motif("depuis l'appareil"),
  // D-096 — RESSERRÉ. `\bgalerie\b` seul classait « galerie sur la fiche » —
  // une galerie de RESTITUTION — comme une acquisition, et faisait échapper un
  // besoin d'affichage réel du corpus. Seule la galerie SOURCE compte.
  motif("(?:depuis|de|dans) la galerie"),
  motif("galerie (?:photos? )?du (?:téléphone|mobile|smartphone|portable)"),
  motif("captur\\p{L}*"),
  motif("import\\p{L}*"),
  motif("téléverser"),
  motif("appareil photo"),
  motif("caméra"),
  motif("scann\\p{L}*"),
  motif("vidéos?"),
  motif("cartes?"),
  motif("gps"),
  motif("géolocalis\\p{L}*"),
  motif("position"),
  motif("notifi\\p{L}*"),
];

/**
 * Capacités ✅ que le SUJET du besoin met en jeu, hors acquisition.
 * Vide si le besoin exige d'acquérir une donnée, ou si son sujet ne relève
 * d'aucune capacité déclarée.
 */
export function capacitesMisesEnJeu(
  statement: string,
  envelope: ExecutionEnvelope,
): readonly string[] {
  // ── D-098 · LA FONCTION DEMANDÉE PRIME SUR UN NOM SECONDAIRE.
  //
  // CAUSE RACINE, mesurée sur `coach-fitness` : « Illustrer les programmes par
  // des visuels (couverture, vignette VIDÉO) » était classé ACQUISITION. Le mot
  // « vidéo » y est un NOM — la couverture d'une vidéo, qu'on AFFICHE — et non
  // la fonction demandée, qui est « illustrer ». L'acquisition faisait pourtant
  // veto sur l'énoncé entier.
  //
  // CONSÉQUENCE : le besoin n'était plus protégé, et supprimer
  // `fld_prog_couverture` au lieu de l'afficher devenait indolore.
  //
  // RÈGLE : l'acquisition ne fait veto QUE si aucune restitution n'est demandée.
  // « prendre une photo » reste une acquisition ; « prendre une photo PUIS
  // L'AFFICHER » demande aussi un affichage, que le moteur sait produire.
  const restitue = RESTITUTION.some((r) => r.test(statement));
  if (!restitue && ACQUISITION.some((r) => r.test(statement))) return [];
  return Object.entries(SUJETS_PAR_FAIT)
    .filter(([fait]) => envelope[fait as keyof ExecutionEnvelope] === true)
    .filter(([, motifs]) => motifs.some((r) => r.test(statement)))
    .filter(([fait]) => !EXIGE_RESTITUTION.has(fait) || restitue)
    .map(([fait]) => fait);
}

/**
 * D-092 — LE SYMÉTRIQUE DE LA CAUSALITÉ, CÔTÉ « SATISFAIT ».
 *
 * FAUX VERT MESURÉ : un besoin « les photos doivent être visibles » déclaré
 * `satisfied` et rattaché à un écran VIVANT mais sans rapport passait F4. Les
 * nœuds existent, ils fonctionnent — et aucune image n'est montrée nulle part.
 *
 * Le contrôle ne juge pas la pertinence des nœuds cités (indécidable) : il
 * exige que le DOCUMENT porte la trace du mécanisme que le besoin engage.
 * Prétendre montrer des photos sans un seul `imageFieldId` est réfutable.
 */
const TRACE_ATTENDUE: Readonly<Record<string, (air: ProjectAir) => boolean>> = {
  imageRendering: (air) =>
    air.screens.some((s) =>
      s.blocks.some((b) => (b.props ?? []).some((p) => p.key === "imageFieldId")),
    ),
  listSearch: (air) =>
    air.screens.some((s) =>
      s.blocks.some((b) => (b.props ?? []).some((p) => p.key === "searchFieldId")),
    ),
  primaryNavigation: (air) => air.navigation.primary !== undefined,
  // E1/E2 (D-129) — la trace est le PROP déclaré sur une liste, comme pour
  // `listSearch`. Prétendre des critères pilotés sans un seul
  // `userFilterFieldIds` est réfutable.
  listUserFiltering: (air) =>
    air.screens.some((s) =>
      s.blocks.some((b) => (b.props ?? []).some((p) => p.key === "userFilterFieldIds")),
    ),
  relationScoping: (air) =>
    air.screens.some((s) =>
      s.blocks.some((b) => (b.props ?? []).some((p) => p.key === "scopeFieldId")),
    ),
  liveData: (air) => air.datasets.some((d) => d.sourceKind === "remote"),
};

/**
 * E3.2 (D-130) — CAPACITÉ ABSENTE ≠ SATISFAITE. `capacitesMisesEnJeu` ne
 * retient que les faits ✅ ; un besoin `satisfied` dont le sujet exige un
 * fait ❌ passait donc sans contrôle. Or aucune trace documentaire ne peut
 * prouver une capacité que l'enveloppe n'a pas : un tel besoin ne peut être
 * que déclaré, jamais satisfait.
 */
export function capacitesAbsentesEngagees(
  statement: string,
  envelope: ExecutionEnvelope,
): readonly string[] {
  // PAS de veto acquisition/restitution ici — il existe (D-089) pour ne pas
  // exiger une trace d'AFFICHAGE d'un besoin d'acquisition. Une capacité que
  // l'enveloppe N'A PAS ne peut être satisfaite sous aucune formulation :
  // « suivre en temps réel » reste un mensonge, verbe d'acquisition ou non.
  return Object.entries(SUJETS_PAR_FAIT)
    .filter(([fait]) => envelope[fait as keyof ExecutionEnvelope] === false)
    .filter(([, motifs]) => motifs.some((r) => r.test(statement)))
    .map(([fait]) => fait);
}

/** Capacités engagées par le besoin dont le document ne porte AUCUNE trace. */
export function tracesManquantes(
  statement: string,
  air: ProjectAir,
  envelope: ExecutionEnvelope,
): readonly string[] {
  return capacitesMisesEnJeu(statement, envelope).filter((f) => {
    const preuve = TRACE_ATTENDUE[f];
    return preuve !== undefined && !preuve(air);
  });
}

export interface RefutationMotif {
  readonly fait: string;
  readonly raison: string;
}

/**
 * Confronte un motif d'inexprimabilité à l'enveloppe.
 * Retourne `null` si le motif tient, une réfutation sinon.
 */
export function refuteUnexpressibleReason(
  reason: string,
  envelope: ExecutionEnvelope,
  statement = "",
): RefutationMotif | null {
  // CAUSALITÉ D'ABORD (D-089). Si le SUJET du besoin relève d'une capacité que
  // l'enveloppe déclare ✅, aucun motif ne peut l'écarter — fût-il vrai. Un
  // fait exact mais hors sujet reste une cause fausse.
  const misesEnJeu = capacitesMisesEnJeu(statement, envelope);
  if (misesEnJeu.length > 0) {
    return {
      fait: misesEnJeu.join(", "),
      raison:
        `le besoin porte sur \`${misesEnJeu.join("`, `")}\`, que l'enveloppe déclare DISPONIBLE : ` +
        "quel que soit le fait invoqué, ce besoin doit être SATISFAIT, pas écarté",
    };
  }
  const cites = FAITS_BOOLEENS.filter((f) => reason.includes(f));

  // Un fait cité qui vaut TRUE réfute le motif : la capacité existe.
  const menteurs = cites.filter((f) => envelope[f]);
  if (menteurs.length > 0) {
    return {
      fait: menteurs.join(", "),
      raison:
        `le motif invoque \`${menteurs.join("`, `")}\`, mais l'enveloppe le déclare VRAI : ` +
        "le moteur sait le faire, le besoin doit être satisfait, pas écarté",
    };
  }

  // Au moins un fait cité doit TENIR — c'est-à-dire valoir false.
  const tenus = cites.filter((f) => !envelope[f]);
  if (tenus.length > 0) return null;

  return {
    fait: "(aucun)",
    raison:
      "le motif ne cite aucun fait de l'enveloppe d'exécution : il affirme une impossibilité " +
      `sans la démontrer. Cite le nom exact d'un fait qui vaut \`false\` (${FAITS_BOOLEENS.join(", ")})`,
  };
}

/**
 * Confronte chaque besoin déclaré à l'état réel des nœuds censés le porter.
 *
 * FAIL-CLOSED sur l'absence : un document sans `intent` ne peut pas être
 * certifié fidèle, puisque rien ne dit à quoi le comparer. C'est le FAIT sur la
 * totalité du corpus historique — et la migration 1.1.0 → 1.2.0 s'interdit
 * d'inventer une intention pour le masquer.
 */
export function evaluateIntentCoverage(
  air: ProjectAir,
  envelope: ExecutionEnvelope,
): IntentReport {
  if (air.intent === undefined) {
    return {
      present: false,
      verdicts: [],
      satisfaits: 0,
      inexprimables: 0,
      defaillants: 0,
      limites: LIMITES,
      passed: false,
      failures: [
        "AUCUNE INTENTION CONSERVÉE : le document ne porte pas la demande qui l'a produit — la fidélité n'a aucun référent.",
      ],
    };
  }

  // INCOHÉRENCE CORRIGÉE (D-079) — `promises.ts` savait qu'un slot LIÉ est
  // vivant (il est invoqué au rendu, pas par le dispatcher, donc `controls()`
  // ne le voit pas). Ce fichier ne le savait PAS : il déclarait morts les cinq
  // slots correctement liés du premier document généré. Deux gates du même
  // chantier qui ne partagent pas la même définition de « vivant » finissent
  // par se contredire — c'est arrivé.
  const vivants = new Set<string>([
    ...reachableScreens(air, envelope.triggers),
    ...controls(air, envelope).filter((c) => c.executed).map((c) => c.actionId),
    ...air.actions
      .filter((a) => a.effect.kind === "slot" && a.effect.binding !== undefined)
      .map((a) => a.id),
    ...dataBindings(air).filter((b) => b.seeded).map((b) => b.entityId),
  ]);
  // TOUS LES NŒUDS IDENTIFIÉS (D-079) — la première version n'énumérait que
  // écrans, blocs, actions, entités et champs. Elle déclarait donc « nœud
  // ABSENT » des datasets, slots, règles, routes, intégrations et tests qui
  // existaient bel et bien : **7 besoins sur 10 accusés à tort** sur le premier
  // document généré. C'est la même faute que je traque partout — un instrument
  // qui mesure moins que ce qu'il affirme. La liste est désormais celle du
  // VALIDATEUR, qui construit déjà l'ensemble complet pour l'unicité.
  const existants = new Set<string>([
    air.projectId,
    ...air.screens.flatMap((s) => [s.id, ...s.blocks.map((b) => b.id)]),
    ...air.navigation.routes.map((r) => r.id),
    ...air.entities.flatMap((e) => [e.id, ...e.fields.map((f) => f.id)]),
    ...air.relations.map((r) => r.id),
    ...air.datasets.map((d) => d.id),
    ...air.actions.map((a) => a.id),
    ...air.rules.map((r) => r.id),
    ...air.slots.map((s) => s.id),
    ...air.integrations.map((i) => i.id),
    ...air.expectedTests.map((t) => t.id),
  ]);

  // Propriétaire de chaque nœud dont la mort n'est pas directement observable.
  // Lu dans la structure, jamais déduit d'un préfixe.
  const proprietaire = new Map<string, string>();
  for (const s of air.screens) {
    for (const b of s.blocks) proprietaire.set(b.id, s.id);
  }
  for (const e of air.entities) {
    for (const f of e.fields) proprietaire.set(f.id, e.id);
  }
  // Nœuds dont la vivacité EST mesurée : écrans, actions, entités.
  const mesurablesDirects = new Set<string>([
    ...air.screens.map((s) => s.id),
    ...air.actions.map((a) => a.id),
    ...air.entities.map((e) => e.id),
  ]);

  const verdicts: NeedVerdict[] = air.intent.needs.map((need) => {
    const base = { needId: need.id, statement: need.statement };
    if (need.resolution.kind === "unexpressible") {
      const refutation = refuteUnexpressibleReason(
        need.resolution.reason,
        envelope,
        need.statement,
      );
      if (refutation !== null) {
        return {
          ...base,
          state: "motif_refute" as const,
          motif: `motif RÉFUTÉ [${refutation.fait}] : ${refutation.raison}`,
        };
      }
      return {
        ...base,
        state: "inexprimable" as const,
        motif: `déclaré hors de portée : ${need.resolution.reason}`,
      };
    }
    const absentes = capacitesAbsentesEngagees(need.statement, envelope);
    if (absentes.length > 0) {
      return {
        ...base,
        state: "satisfaction_non_prouvee" as const,
        motif:
          `déclaré satisfait, mais la capacité \`${absentes.join("\`, \`")}\` est ` +
          "ABSENTE de l'enveloppe (fait ❌) : un besoin qui l'exige ne peut pas être " +
          "satisfait — il doit être déclaré, avec ce fait cité",
      };
    }
    const sansTrace = tracesManquantes(need.statement, air, envelope);
    if (sansTrace.length > 0) {
      return {
        ...base,
        state: "satisfaction_non_prouvee" as const,
        motif:
          `déclaré satisfait, mais le document ne porte aucune trace de \`${sansTrace.join("`, `")}\` : ` +
          "aucun bloc ne l'exprime nulle part",
      };
    }
    const brisees = need.resolution.nodeIds.filter((id) => !existants.has(id));
    if (brisees.length > 0) {
      return {
        ...base,
        state: "reference_brisee" as const,
        motif: `rattaché à des nœuds ABSENTS du document : ${brisees.join(", ")}`,
      };
    }
    // Les blocs et les champs n'ont pas de vie propre : ils vivent par l'écran
    // ou l'entité qui les porte, déjà mesurés. Seuls les nœuds dont la mort est
    // OBSERVABLE sont exigés vivants — sinon la gate refuserait pour une
    // propriété qu'elle ne sait pas mesurer.
    // ── D-100 · UN NŒUD VIT PAR SON PROPRIÉTAIRE.
    //
    // CAUSE RACINE trouvée à l'audit P7. Cette liste ne retenait que les nœuds
    // dont la mort est DIRECTEMENT observable — écrans, actions, entités. Les
    // blocs et les champs en étaient exclus, au motif qu'ils « vivent par
    // l'écran ou l'entité qui les porte ». C'était juste, mais l'inférence
    // n'était pas faite : ils étaient simplement IGNORÉS.
    //
    // MESURÉ : un besoin rattaché à l'ÉCRAN mort est correctement signalé ;
    // le même besoin rattaché à un BLOC DE CE MÊME ÉCRAN passait « satisfait ».
    // N'importe quel besoin pouvait donc être satisfait en citant un bloc au
    // lieu de son écran — une échappatoire générale, sans suppression ni
    // mutation.
    //
    // Le propriétaire se lit dans la STRUCTURE du document, jamais dans un
    // préfixe d'identifiant : un bloc appartient à son écran, un champ à son
    // entité. Résoudre puis mesurer le propriétaire ferme la classe entière.
    const mesurables = need.resolution.nodeIds
      .map((id) => proprietaire.get(id) ?? id)
      .filter((id) => vivants.has(id) || mesurablesDirects.has(id));
    const morts = mesurables.filter((id) => !vivants.has(id));
    if (morts.length > 0) {
      return {
        ...base,
        state: "satisfait_par_du_mort" as const,
        motif: `rattaché à des nœuds qui NE FONCTIONNENT PAS : ${morts.join(", ")}`,
      };
    }
    return {
      ...base,
      state: "satisfait" as const,
      motif: `porté par ${need.resolution.nodeIds.length} nœud(s) vivant(s)`,
    };
  });

  const brisees = verdicts.filter((v) => v.state === "reference_brisee").length;
  const morts = verdicts.filter((v) => v.state === "satisfait_par_du_mort").length;
  const refutes = verdicts.filter((v) => v.state === "motif_refute").length;
  const nonProuves = verdicts.filter((v) => v.state === "satisfaction_non_prouvee").length;
  const failures: string[] = [];
  if (brisees > 0) failures.push(`${brisees} besoin(s) rattaché(s) à des nœuds INEXISTANTS`);
  if (morts > 0) failures.push(`${morts} besoin(s) rattaché(s) à des nœuds MORTS`);
  if (refutes > 0) failures.push(`${refutes} besoin(s) écarté(s) sur un motif RÉFUTÉ par l'enveloppe`);
  if (nonProuves > 0) {
    failures.push(`${nonProuves} besoin(s) déclaré(s) satisfaits SANS TRACE dans le document`);
  }

  return {
    present: true,
    verdicts,
    satisfaits: verdicts.filter((v) => v.state === "satisfait").length,
    inexprimables: verdicts.filter((v) => v.state === "inexprimable").length,
    defaillants: brisees + morts + refutes + nonProuves,
    limites: LIMITES,
    passed: failures.length === 0,
    failures,
  };
}
