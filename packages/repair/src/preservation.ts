// CONSERVATION DES PREUVES PAYÉES ET CLASSIFICATION HONNÊTE DE L'ÉCHEC.
//
// ────────────────────────────────────────────────────────────────────────
// CAUSE RACINE MESURÉE — génération P9, 2026-09-01
//
// L'émission initiale était protégée : `emitSectionsAvecPartiel` (D-103)
// attachait à l'erreur les sections déjà obtenues, donc déjà FACTURÉES.
// La RÉPARATION ne l'était pas. Elle accumulait ses sections réémises dans
// une variable LOCALE, et une erreur technique emportait cette variable avec
// la pile.
//
// P9 a payé 1,7718 $ sur 7 appels, puis a reçu un `529 Overloaded` PENDANT la
// réparation. Les sections déjà réparées et payées ont été perdues : il ne
// reste de cette dépense qu'un nombre dans un journal. La preuve la plus
// chère du chantier a été détruite par l'absence de six lignes.
//
// SECONDE CAUSE, INDÉPENDANTE — la classification.
// `issueGeneration` ne connaissait que trois états. Une erreur technique ne
// correspondait à aucun, et retombait donc sur `terminee` — le plus favorable.
// Un journal pouvait affirmer qu'une génération s'était TERMINÉE alors qu'elle
// avait échoué : exactement le faux positif que ce chantier traque partout
// ailleurs.
//
// TROISIÈME CAUSE, INDÉPENDANTE — la provenance.
// Les artefacts portaient un nom FIXE (`coach-fitness.attempt2.air.json`),
// réécrit à chaque campagne. Le reliquat de P8 a donc survécu à P9 sous un nom
// que rien ne distinguait d'un artefact de P9. Un nom qui ne porte pas sa
// génération ne prouve rien : il ressemble seulement à une preuve.
//
// Ce module est PUR : il ne lit ni n'écrit aucun fichier, ne connaît ni
// horloge ni aléa. L'identifiant de campagne lui est DONNÉ par l'appelant.
// ────────────────────────────────────────────────────────────────────────

/**
 * Clés sous lesquelles un travail interrompu attache ce qu'il avait déjà
 * produit. Deux clés DISTINCTES : une émission partielle et une réparation
 * partielle ne se confondent pas, et une phase ne peut pas écraser l'autre.
 */
export const CLE_EMISSION = "assemblagePartiel";
export const CLE_REPARATION = "reparationPartielle";

/**
 * Une erreur qui n'était pas un objet ne pouvait rien porter. Plutôt que de
 * perdre la preuve, on l'enveloppe — et le message d'origine est conservé.
 */
export class TravailInterrompuError extends Error {
  readonly causeBrute: unknown;
  constructor(causeBrute: unknown) {
    super(String(causeBrute));
    this.name = "TravailInterrompuError";
    this.causeBrute = causeBrute;
  }
}

/**
 * Attache un accumulateur à l'erreur qui interrompt le travail, et rend
 * l'erreur À JETER. N'ÉCRASE JAMAIS un accumulateur déjà attaché : le premier
 * travail interrompu est celui qui a payé, sa preuve prime.
 */
export function attacherPartiel(erreur: unknown, cle: string, partiel: unknown): unknown {
  const porteur =
    typeof erreur === "object" && erreur !== null ? erreur : new TravailInterrompuError(erreur);
  const champs = porteur as Record<string, unknown>;
  if (champs[cle] === undefined) champs[cle] = partiel;
  return porteur;
}

/** Relit ce qu'un travail interrompu avait attaché. `undefined` si rien. */
export function partielDeLErreur(erreur: unknown, cle: string): unknown {
  if (typeof erreur !== "object" || erreur === null) return undefined;
  return (erreur as Record<string, unknown>)[cle];
}

/**
 * AUCUN TRAVAIL DÉJÀ PAYÉ N'EST PERDU. Exécute `travail` ; s'il échoue — pour
 * quelque raison que ce soit, budget, refus, troncature, 529 — l'accumulateur
 * voyage avec l'erreur au lieu de mourir avec la pile.
 *
 * L'erreur est TOUJOURS relancée : ce garde conserve, il n'avale rien.
 */
export async function avecPreservation<T>(
  cle: string,
  partiel: unknown,
  travail: () => Promise<T>,
): Promise<T> {
  try {
    return await travail();
  } catch (erreur) {
    throw attacherPartiel(erreur, cle, partiel);
  }
}

/** L'état d'une réparation en cours — ce qui a été réémis, et le document obtenu. */
export interface ReparationPartielle {
  /** Sections effectivement réémises, dans l'ordre où elles ont été payées. */
  readonly sectionsReemises: string[];
  /** Document en cours de réparation : l'attempt 1 plus les sections déjà réparées. */
  readonly document: Record<string, unknown>;
}

/** Accumulateur de réparation amorcé sur le document à réparer. */
export function reparationPartielleVierge(
  document: Readonly<Record<string, unknown>>,
): ReparationPartielle {
  return { sectionsReemises: [], document: { ...document } };
}

/**
 * Une réparation partielle ne mérite d'être conservée que si une section a
 * réellement été payée. Zéro section réémise = rien à prouver.
 */
export function estExploitable(partiel: ReparationPartielle): boolean {
  return partiel.sectionsReemises.length > 0;
}

/** Les quatre natures d'artefact qu'une campagne peut déposer. */
export const PHASES_ARTEFACT = [
  "attempt1",
  "attempt2",
  "emission-partielle",
  "reparation-partielle",
] as const;
export type PhaseArtefact = (typeof PHASES_ARTEFACT)[number];

export interface ProvenanceArtefact {
  readonly slug: string;
  readonly runId: string;
  readonly phase: PhaseArtefact;
}

const SEPARATEUR = ".";

/**
 * Nom d'artefact PORTEUR DE SA GÉNÉRATION. Deux campagnes distinctes ne
 * peuvent pas produire le même nom : le reliquat de P8 ne pourra plus être
 * lu comme un artefact de P9.
 *
 * `slug` et `runId` ne peuvent pas contenir de point — c'est le séparateur qui
 * rend le nom relisible. Un nom illisible ne prouve rien : on refuse de
 * l'écrire plutôt que de déposer un artefact d'origine incertaine.
 */
export function nomArtefact(p: ProvenanceArtefact): string {
  for (const [champ, valeur] of [
    ["slug", p.slug],
    ["runId", p.runId],
  ] as const) {
    if (valeur.length === 0) throw new Error(`provenance d'artefact : ${champ} vide`);
    if (valeur.includes(SEPARATEUR)) {
      throw new Error(`provenance d'artefact : ${champ} « ${valeur} » contient un point`);
    }
  }
  return `${p.slug}.${p.runId}.${p.phase}.air.json`;
}

/**
 * Relit la provenance depuis le nom seul — sans journal, sans contexte.
 * `null` si le nom ne porte pas sa génération : un tel fichier est un
 * reliquat, jamais une preuve.
 */
export function provenanceDuNom(nom: string): ProvenanceArtefact | null {
  const parts = nom.split(SEPARATEUR);
  if (parts.length !== 5) return null;
  const [slug, runId, phase, air, json] = parts;
  // `noUncheckedIndexedAccess` : la longueur vérifiée ne suffit pas au
  // compilateur, et il a raison de l'exiger — on le dit explicitement.
  if (slug === undefined || runId === undefined || phase === undefined) return null;
  if (air !== "air" || json !== "json") return null;
  if (slug.length === 0 || runId.length === 0) return null;
  if (!(PHASES_ARTEFACT as readonly string[]).includes(phase)) return null;
  return { slug, runId, phase: phase as PhaseArtefact };
}
