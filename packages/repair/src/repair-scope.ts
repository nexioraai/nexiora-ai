// PÉRIMÈTRE DE RÉPARATION (D-088 · D1) — où vit le correctif, et ce qu'une
// réparation n'a PAS le droit de faire disparaître.
//
// ────────────────────────────────────────────────────────────────────────
// CAUSE RACINE MESURÉE
//
// La boucle d'émission réémet les seules sections DÉSIGNÉES PAR LE CHEMIN du
// diagnostic. Or un chemin dit où le défaut s'OBSERVE, jamais où le correctif
// APPARTIENT. Mesuré sur documents réels, 3 classes sur 4 :
//
//   ① image orpheline      observée `entities[…]`      → correctif dans `screens`
//   ③ promesse sans cible  observée `expectedTests[…]` → correctif dans `actions`
//   ④ destination morte    observée `navigation`       → correctif dans `actions`
//
// La section porteuse du correctif n'étant jamais réémise, la SEULE façon de
// satisfaire le validateur était de SUPPRIMER la référence fautive. Le
// pipeline n'ouvrait qu'une porte, et c'était celle de l'amputation.
//
// Deux garanties, parce qu'une seule se contourne :
//   · ROUTAGE     — la section du correctif est réémise, donc réparer devient
//                   POSSIBLE ;
//   · AMPUTATION  — ce que le diagnostic ne désigne pas ne peut pas
//                   disparaître, donc supprimer devient IMPOSSIBLE.
// ────────────────────────────────────────────────────────────────────────

/** Sections d'émission, identiques au découpage de la boucle. */
export type SectionEmission =
  | "base"
  | "donnees"
  | "ecrans"
  | "actions"
  | "capacites"
  | "cablage"
  | "intention";

export const SECTION_KEYS: Readonly<Record<SectionEmission, readonly string[]>> = {
  base: [
    "airSchemaVersion",
    "projectId",
    "app",
    "navigation",
    "design",
    "network",
    "native",
    "compliance",
  ],
  donnees: ["entities", "relations", "datasets", "rules", "slots"],
  ecrans: ["screens"],
  actions: ["actions"],
  capacites: ["capabilities", "permissions"],
  cablage: ["integrations", "expectedTests"],
  intention: ["intent"],
};

/** Section où un CHEMIN s'observe. C'est le comportement historique. */
export function sectionDuChemin(path: string): SectionEmission {
  const racine = path.split(/[.[]/)[0] ?? "";
  for (const [section, keys] of Object.entries(SECTION_KEYS)) {
    if (keys.includes(racine)) return section as SectionEmission;
  }
  return "base";
}

/**
 * MATRICE — propriété violée → sections susceptibles de PORTER le correctif.
 *
 * Chaque entrée inclut la section d'observation ET celles où la propriété
 * corrective peut vivre. Un code absent de cette table retombe sur la seule
 * section d'observation : c'est le comportement d'origine, et le test
 * d'exhaustivité interdit qu'un code y tombe par oubli.
 */
export const SECTIONS_CORRECTIVES: Readonly<Record<string, readonly SectionEmission[]>> = {
  // Une image déclarée et jamais montrée : la MONTRER vit dans `screens`.
  AIR_IMAGE_ORPHELINE: ["donnees", "ecrans"],

  // Une promesse sans cible : CRÉER la cible vit dans `actions` ou `screens`.
  AIR_TEST_TARGET_UNKNOWN: ["cablage", "actions", "ecrans"],

  // Une destination qu'aucune action n'atteint : la navigation vit dans `actions`.
  AIR_NAV_DESTINATION_DEAD: ["base", "actions"],
  AIR_NAV_TAB_DUPLICATE: ["base", "actions", "ecrans"],
  AIR_NAV_ROUTE_MISSING: ["base", "ecrans"],
  AIR_NAV_SCREEN_MISSING: ["base", "ecrans"],
  AIR_NAV_SCREEN_UNKNOWN: ["base", "ecrans"],
  AIR_NAV_ENTRY_UNKNOWN: ["base", "ecrans"],
  AIR_NAV_ORDER_DUPLICATE: ["base"],
  AIR_NAV_ORDER_NOT_CONTIGUOUS: ["base"],

  // Un bloc pointe une entité absente : l'entité vit dans `donnees`.
  AIR_BLOCK_ENTITY_UNKNOWN: ["ecrans", "donnees"],
  AIR_BLOCK_VISIBILITY_ENTITY_UNKNOWN: ["ecrans", "donnees"],
  AIR_REF_ENTITY_MISSING: ["ecrans", "donnees"],
  AIR_REF_BLOCK_MISSING: ["ecrans", "actions"],
  BLOCK_ENTITY_UNKNOWN: ["ecrans", "donnees"],
  BLOCK_ENTITY_REQUIRED: ["ecrans", "donnees"],
  BLOCK_ENTITY_FORBIDDEN: ["ecrans"],
  BLOCK_FIELD_UNKNOWN: ["ecrans", "donnees"],
  BLOCK_ACTION_UNKNOWN: ["ecrans", "actions"],
  BLOCK_PROPS_INVALID: ["ecrans"],
  BLOCK_UNKNOWN: ["ecrans"],
  // D-104 — un déclencheur `ui` sur un bloc sans affordance. Deux réparations
  // légitimes : déplacer le déclencheur vers un bloc actionnable (`actions`),
  // ou ajouter à l'écran le bouton qui portera l'action (`ecrans`).
  BLOCK_TRIGGER_SANS_AFFORDANCE: ["actions", "ecrans"],

  // Un formulaire dont AUCUNE action ne déclenche la soumission. La réparation
  // est d'AJOUTER l'action : elle vit donc dans `actions`. Le formulaire, lui,
  // n'a rien à corriger — et la règle 27 interdit de le retirer.
  FORM_SANS_ACTION: ["actions"],

  // Une action pointe un écran / une entité / un slot absent.
  AIR_ACTION_SCREEN_UNKNOWN: ["actions", "ecrans"],
  AIR_ACTION_TRIGGER_SCREEN_UNKNOWN: ["actions", "ecrans"],
  AIR_ACTION_TRIGGER_BLOCK_UNKNOWN: ["actions", "ecrans"],
  AIR_ACTION_ENTITY_UNKNOWN: ["actions", "donnees"],
  AIR_ACTION_TRIGGER_ENTITY_UNKNOWN: ["actions", "donnees"],
  AIR_ACTION_SLOT_UNKNOWN: ["actions", "donnees"],
  AIR_SLOT_UNKNOWN: ["donnees", "actions"],
  AIR_SLOT_INPUT_UNBOUND: ["donnees", "actions"],
  AIR_SLOT_INPUT_UNKNOWN: ["donnees", "actions"],
  AIR_SLOT_OUTPUT_UNKNOWN: ["donnees", "actions"],

  // Une capability doit être DÉCLARÉE là où elle manque.
  AIR_ACTION_CAPABILITY_UNDECLARED: ["capacites", "actions"],
  AIR_PERMISSION_CAPABILITY_UNDECLARED: ["capacites"],
  AIR_INTEGRATION_CAPABILITY_UNDECLARED: ["capacites", "cablage"],

  // Purement internes à leur section.
  AIR_DATASET_ENTITY_UNKNOWN: ["donnees"],
  AIR_REL_ENTITY_UNKNOWN: ["donnees"],
  AIR_RULE_ENTITY_UNKNOWN: ["donnees"],
  AIR_RULE_FIELD_UNKNOWN: ["donnees"],
  AIR_FIELD_DISPLAY_MISSING: ["donnees"],
  AIR_FIELD_DISPLAY_NOT_REFERENCE: ["donnees"],
  AIR_FIELD_ENUM_VALUES_MISSING: ["donnees"],
  AIR_FIELD_ENUM_VALUES_UNEXPECTED: ["donnees"],
  AIR_FIELD_REFERENCE_TARGET_MISSING: ["donnees"],
  AIR_FIELD_REFERENCE_TARGET_UNKNOWN: ["donnees"],
  AIR_FIELD_REFERENCE_UNEXPECTED: ["donnees"],
  AIR_DUP_ID: ["donnees", "ecrans", "actions"],
  AIR_CONFIG_DUP_KEY: ["cablage"],
  AIR_INTEGRATION_SECRET_LIKE_KEY: ["cablage"],
  AIR_COMMERCE_DIGITAL_PSP_FORBIDDEN: ["cablage", "base"],
  AIR_LOCALE_DEFAULT_NOT_DECLARED: ["base"],
  AIR_INTENT_REQUISE: ["intention"],
};

export interface DiagnosticLike {
  readonly code: string;
  readonly path: string;
  /**
   * Les validateurs nomment le nœud fautif DANS LE MESSAGE, pas dans le
   * chemin : `AIR_IMAGE_ORPHELINE` a pour chemin `entities[1].fields[2]` et
   * cite `"fld_type_illustration"` dans son texte. Ignorer le message ferait
   * passer toute suppression légitime pour une amputation.
   */
  readonly message?: string;
}

/** Sections à réémettre pour un lot de diagnostics. */
export function sectionsAReemettre(
  diagnostics: readonly DiagnosticLike[],
): readonly SectionEmission[] {
  const out = new Set<SectionEmission>();
  for (const d of diagnostics) {
    const table = SECTIONS_CORRECTIVES[d.code];
    if (table !== undefined) {
      for (const s of table) out.add(s);
      continue;
    }
    out.add(sectionDuChemin(d.path));
  }
  return [...out];
}

// ────────────────────────────────────────────────────────────────────────
// GARANTIE ANTI-AMPUTATION — INTRA-EXÉCUTION.
//
// Comparer deux GÉNÉRATIONS indépendantes est mal fondé : le modèle a le droit
// de remodeler. Comparer l'attempt 1 et l'attempt 2 d'une MÊME exécution ne
// l'est pas : c'est le même document, réparé, et la consigne est explicitement
// « conserve tout le reste à l'identique ». Ce qui disparaît sans avoir été
// désigné par un diagnostic est une amputation.
// ────────────────────────────────────────────────────────────────────────

// ── D-093 · LE PÉRIMÈTRE EST DANS LE CHEMIN, PAS DANS LE TEXTE.
//
// CAUSE RACINE, révélée par la génération P5 sur données réelles.
//
// Le garde autorisait une mutation si l'identifiant du nœud APPARAISSAIT
// QUELQUE PART dans le texte des diagnostics. Cette règle est fausse dans les
// DEUX sens :
//
//   TROP LÂCHE — un identifiant cité n'importe où autorisait TOUTE mutation de
//   ce nœud : son type, son propriétaire, sa relation, tout.
//
//   TROP STRICTE — quand le diagnostic nomme la VALEUR À REMPLACER plutôt que
//   le nœud, la réparation attendue était refusée. Mesuré en P5 :
//     diagnostic  AIR_TEST_TARGET_UNKNOWN  expectedTests[0].targetId
//                 « cible "blk_accueil_urgences" introuvable »
//     réparation  promesse:blk_accueil_urgences → promesse:scr_accueil
//   Un bloc n'est pas une cible valide : re-pointer vers l'écran ÉTAIT la
//   correction. Le garde cherchait « test_accueil_urgences_visibles » dans le
//   diagnostic, qui ne nomme que l'ancienne cible. 16 réparations légitimes
//   rejetées, document laissé invalide.
//
// LA RÈGLE CORRECTE : le CHEMIN d'un diagnostic désigne déjà le nœud ET la
// propriété à corriger — `expectedTests[0].targetId`, `actions[3].effect.screenId`,
// `datasets[2].entityId`. Le périmètre s'en déduit exactement.
//
//   mutation autorisée ⟺ elle porte sur une propriété qu'un diagnostic désigne
//
// Un chemin sans propriété terminale (`entities[1].fields[2]`) désigne le nœud
// ENTIER : il peut être corrigé ou supprimé. Un chemin avec propriété
// (`expectedTests[0].targetId`) n'autorise QUE cette propriété — le reste du
// nœud demeure protégé.

/** Composante de signature touchée par une propriété du chemin d'un diagnostic. */
const COMPOSANTE_PAR_PROPRIETE: Readonly<Record<string, string>> = {
  targetId: "cible",
  type: "nature",
  fromEntityId: "extremites",
  toEntityId: "extremites",
  effect: "effet",
  resolution: "resolution",
  airSchemaVersion: "version",
  entityId: "porteur",
  blockType: "nature",
};

/** Composante de signature qui a CHANGÉ entre deux empreintes. */
function composanteMutee(avant: string, apres: string): string {
  const [tetA, resteA = ""] = avant.split(":");
  const [tetB, resteB = ""] = apres.split(":");
  if (tetA !== tetB) return "nature";
  if (tetA === "promesse") return "cible";
  if (tetA === "besoin") return "resolution";
  if (tetA === "air") return "version";
  if (tetA === "action") return "effet";
  if (tetA === "relation") return "extremites";
  if (tetA === "champ") {
    const [typeA, propA] = resteA.split("@");
    const [typeB, propB] = resteB.split("@");
    if (typeA !== typeB) return "nature";
    if (propA !== propB) return "porteur";
  }
  if (tetA === "bloc") return "porteur";
  return "inconnu";
}

export interface PerimetreNoeud {
  /** Le nœud ENTIER est en périmètre : corrigeable ou supprimable. */
  readonly entier: boolean;
  /** Composantes de signature explicitement désignées par un diagnostic. */
  readonly composantes: ReadonlySet<string>;
}

const jetons = (path: string): readonly string[] =>
  path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((t) => t.length > 0);

/**
 * Périmètre de réparation déduit des CHEMINS des diagnostics.
 * Résout chaque chemin dans le document d'origine, retient le nœud identifié
 * le plus profond, et la propriété résiduelle qu'il désigne.
 */
export function perimetreDeReparation(
  avant: unknown,
  diagnostics: readonly DiagnosticLike[],
): ReadonlyMap<string, PerimetreNoeud> {
  const out = new Map<string, { entier: boolean; composantes: Set<string> }>();
  const noter = (id: string, propriete: string | undefined): void => {
    const e = out.get(id) ?? { entier: false, composantes: new Set<string>() };
    if (propriete === undefined) e.entier = true;
    else {
      const c = COMPOSANTE_PAR_PROPRIETE[propriete];
      if (c === undefined) e.entier = true;
      else e.composantes.add(c);
    }
    out.set(id, e);
  };

  for (const d of diagnostics) {
    const toks = jetons(d.path);
    if (toks.length === 0) continue;
    if (toks[0] === "airSchemaVersion") {
      noter("<document>", "airSchemaVersion");
      continue;
    }
    let courant: unknown = avant;
    let dernierId: string | undefined;
    let resteApresId: string[] = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] ?? "";
      if (typeof courant !== "object" || courant === null) break;
      const suivant = Array.isArray(courant)
        ? (courant as unknown[])[Number(t)]
        : (courant as Record<string, unknown>)[t];
      if (suivant === undefined) break;
      courant = suivant;
      if (
        typeof courant === "object" &&
        courant !== null &&
        typeof (courant as { id?: unknown }).id === "string"
      ) {
        dernierId = (courant as { id: string }).id;
        resteApresId = toks.slice(i + 1);
      }
    }
    if (dernierId === undefined) continue;
    noter(dernierId, resteApresId[0]);
  }
  return new Map([...out].map(([k, v]) => [k, { entier: v.entier, composantes: v.composantes }]));
}

const CLES_IDENTIFIANTES = [
  "entities",
  "screens",
  "actions",
  "relations",
  "datasets",
  "rules",
  "slots",
  "integrations",
  "expectedTests",
  "capabilities",
] as const;

/** Tous les identifiants portés par un document, sections et champs compris. */
export function identifiantsDuDocument(document: unknown): ReadonlySet<string> {
  const ids = new Set<string>();
  if (typeof document !== "object" || document === null) return ids;
  const doc = document as Record<string, unknown>;
  const visiter = (noeud: unknown): void => {
    if (Array.isArray(noeud)) {
      for (const n of noeud) visiter(n);
      return;
    }
    if (typeof noeud !== "object" || noeud === null) return;
    const o = noeud as Record<string, unknown>;
    if (typeof o.id === "string") ids.add(o.id);
    for (const v of Object.values(o)) visiter(v);
  };
  for (const cle of CLES_IDENTIFIANTES) visiter(doc[cle]);
  visiter(doc.intent);
  return ids;
}

export interface Amputation {
  readonly id: string;
  readonly designeParUnDiagnostic: boolean;
}

/**
 * Identifiants présents AVANT la réparation et absents APRÈS.
 * `designeParUnDiagnostic` distingue une suppression légitime — le diagnostic
 * nommait ce nœud — d'une amputation silencieuse.
 */
export function amputations(
  avant: unknown,
  apres: unknown,
  diagnostics: readonly DiagnosticLike[],
): readonly Amputation[] {
  const idsAvant = identifiantsDuDocument(avant);
  const idsApres = identifiantsDuDocument(apres);
  // D-093 : le périmètre vient du CHEMIN du diagnostic, jamais d'une recherche
  // de sous-chaîne. Supprimer un nœud exige que le diagnostic le désigne
  // ENTIER — un diagnostic portant sur une seule propriété ne l'autorise pas.
  const perimetre = perimetreDeReparation(avant, diagnostics);
  const out: Amputation[] = [];
  for (const id of idsAvant) {
    if (idsApres.has(id)) continue;
    out.push({ id, designeParUnDiagnostic: perimetre.get(id)?.entier === true });
  }
  return out;
}

// ── D-089 · L'AMPUTATION N'EST PAS LA SEULE DISPARITION.
//
// Trouvée en cherchant des échappatoires APRÈS les corrections : changer le
// `type` d'un champ `asset` en `string` conserve son identifiant. Aucune
// amputation n'est donc détectée — et pourtant l'image a disparu de tout
// contrôle : plus d'orpheline possible, plus d'obligation d'affichage.
// Le nœud survit, sa NATURE est amputée.
//
// Le contrôle porte sur le `type` des champs, parce que c'est lui qui décide de
// ce que le document promet. Renommer un libellé reste libre ; changer ce qu'un
// champ EST ne l'est pas.

export interface Denaturation {
  readonly id: string;
  readonly avant: string;
  readonly apres: string;
}

const typesDeChamps = (document: unknown): ReadonlyMap<string, string> => {
  const out = new Map<string, string>();
  if (typeof document !== "object" || document === null) return out;
  const entities = (document as { entities?: unknown }).entities;
  if (!Array.isArray(entities)) return out;
  for (const e of entities) {
    const fields = (e as { fields?: unknown }).fields;
    if (!Array.isArray(fields)) continue;
    for (const f of fields) {
      const champ = f as { id?: unknown; type?: unknown };
      if (typeof champ.id === "string" && typeof champ.type === "string") {
        out.set(champ.id, champ.type);
      }
    }
  }
  return out;
};

/**
 * Champs dont le TYPE a changé sans qu'un diagnostic les nomme.
 * Une dénaturation est une suppression qui garde l'apparence du nœud.
 */
export function denaturationsHorsPerimetre(
  avant: unknown,
  apres: unknown,
  diagnostics: readonly DiagnosticLike[],
): readonly Denaturation[] {
  const a = typesDeChamps(avant);
  const b = typesDeChamps(apres);
  const perimetre = perimetreDeReparation(avant, diagnostics);
  const out: Denaturation[] = [];
  for (const [id, type] of a) {
    const apresType = b.get(id);
    if (apresType === undefined || apresType === type) continue;
    const p = perimetre.get(id);
    if (p?.entier === true || p?.composantes.has("nature") === true) continue;
    out.push({ id, avant: type, apres: apresType });
  }
  return out;
}

// ── D-091 · L'IDENTITÉ N'EST PAS L'IDENTIFIANT.
//
// Trouvée en passe 4. `amputations` compare des ENSEMBLES D'IDENTIFIANTS ; elle
// ne compare aucune APPARTENANCE. Or l'identité d'un champ inclut l'entité qui
// le porte, celle d'une relation ses deux extrémités, celle d'une action son
// effet, celle du document sa version.
//
// MESURÉ — quatre transformations passaient, toutes en conservant l'identifiant :
//   · déplacer un champ `asset` vers une AUTRE entité, ou vers une entité
//     NOUVELLE non affichée → `AIR_IMAGE_ORPHELINE` ne se déclenche plus, et
//     l'obligation d'affichage est éteinte sans qu'aucun nœud ne disparaisse ;
//   · retourner une relation A→B en B→A ;
//   · changer `airSchemaVersion` pendant la réparation ;
//   · basculer la résolution d'un besoin.
//
// La signature ci-dessous est l'EMPREINTE SÉMANTIQUE d'un nœud : ce qui doit
// rester vrai après une réparation qui ne fait que corriger les diagnostics.
// Elle ne contient AUCUN libellé — renommer un titre reste libre.

/** Empreinte sémantique de chaque nœud identifié du document. */
export function signaturesDuDocument(document: unknown): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  if (typeof document !== "object" || document === null) return out;
  const doc = document as Record<string, unknown>;
  const tab = (k: string): readonly Record<string, unknown>[] =>
    Array.isArray(doc[k]) ? (doc[k] as Record<string, unknown>[]) : [];

  const version = typeof doc.airSchemaVersion === "string" ? doc.airSchemaVersion : "?";
  out.set("<document>", `air:${version}`);

  for (const e of tab("entities")) {
    if (typeof e.id !== "string") continue;
    out.set(e.id, "entite");
    const fields = Array.isArray(e.fields) ? (e.fields as Record<string, unknown>[]) : [];
    for (const f of fields) {
      if (typeof f.id !== "string") continue;
      // Le PROPRIÉTAIRE fait partie de l'identité : un champ déplacé n'est plus
      // le même champ, même s'il garde son identifiant.
      out.set(f.id, `champ:${String(f.type)}@${e.id}`);
    }
  }
  for (const r of tab("relations")) {
    if (typeof r.id !== "string") continue;
    out.set(r.id, `relation:${String(r.fromEntityId)}→${String(r.toEntityId)}`);
  }
  for (const s of tab("screens")) {
    if (typeof s.id !== "string") continue;
    out.set(s.id, "ecran");
    const blocks = Array.isArray(s.blocks) ? (s.blocks as Record<string, unknown>[]) : [];
    for (const b of blocks) {
      if (typeof b.id !== "string") continue;
      const lie = typeof b.entityId === "string" ? b.entityId : "-";
      out.set(b.id, `bloc:${String(b.blockType)}@${s.id}/${lie}`);
    }
  }
  for (const a of tab("actions")) {
    if (typeof a.id !== "string") continue;
    const effet = (a.effect as { kind?: unknown } | undefined)?.kind;
    out.set(a.id, `action:${String(effet)}`);
  }
  for (const t of tab("expectedTests")) {
    if (typeof t.id !== "string") continue;
    out.set(t.id, `promesse:${String(t.targetId)}`);
  }
  const intent = doc.intent as { needs?: unknown } | undefined;
  const needs = Array.isArray(intent?.needs) ? (intent.needs as Record<string, unknown>[]) : [];
  for (const n of needs) {
    if (typeof n.id !== "string") continue;
    const kind = (n.resolution as { kind?: unknown } | undefined)?.kind;
    out.set(n.id, `besoin:${String(kind)}`);
  }
  return out;
}

export interface MutationStructurelle {
  readonly id: string;
  readonly avant: string;
  readonly apres: string;
}

/**
 * Nœuds dont l'EMPREINTE SÉMANTIQUE a changé sans qu'un diagnostic les nomme.
 * Subsume la dénaturation (le type d'un champ en fait partie) et couvre le
 * déplacement, l'inversion de relation, le changement d'effet et de version.
 */
export function mutationsHorsPerimetre(
  avant: unknown,
  apres: unknown,
  diagnostics: readonly DiagnosticLike[],
): readonly MutationStructurelle[] {
  const a = signaturesDuDocument(avant);
  const b = signaturesDuDocument(apres);
  const perimetre = perimetreDeReparation(avant, diagnostics);
  const out: MutationStructurelle[] = [];
  for (const [id, sig] of a) {
    const apresSig = b.get(id);
    if (apresSig === undefined || apresSig === sig) continue;
    const p = perimetre.get(id);
    if (p !== undefined) {
      // Le nœud entier est en périmètre : toute correction lui est permise.
      if (p.entier) continue;
      // Sinon, SEULE la composante que le diagnostic désigne peut changer.
      if (p.composantes.has(composanteMutee(sig, apresSig))) continue;
    }
    out.push({ id, avant: sig, apres: apresSig });
  }
  return out;
}

/** Amputations qu'aucun diagnostic ne justifie. Une seule suffit à refuser. */
export function amputationsHorsPerimetre(
  avant: unknown,
  apres: unknown,
  diagnostics: readonly DiagnosticLike[],
): readonly string[] {
  return amputations(avant, apres, diagnostics)
    .filter((a) => !a.designeParUnDiagnostic)
    .map((a) => a.id);
}
