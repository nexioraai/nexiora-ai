// REMPLISSAGE CONFORME AUX RÈGLES DU DOCUMENT — instrument de mesure.
//
// ────────────────────────────────────────────────────────────────────────
// CAUSE RACINE MESURÉE (2026-09-01)
//
// La gate `controles-fantomes` remplissait CHAQUE champ texte avec la même
// constante, `"0700000000"`. Le runtime annule toute mutation dont une règle
// déclarée est violée (`reglesRespectees`, D-062). Or cette constante n'est ni
// une adresse e-mail, ni une valeur d'énumération, ni un nombre dans une borne.
//
// Conséquence : tout document portant une règle un peu stricte voyait ses
// contrôles comptés FANTÔMES — alors qu'ils faisaient exactement leur travail,
// refuser une saisie invalide. Le document le mieux validé était le plus puni.
//
// Mesuré sur les 26 applications compilées : **183 → 155 fantômes**, soit
// **28 faux positifs** répartis sur 10 applications. Deux applications déjà à
// 100 % agissantes (`resto-riche`, `cours-cuisine`) le restent — la correction
// ne fabrique aucun vert.
//
// CE QUI N'EST PAS CORRIGÉ ICI, et doit rester visible : `update` et `delete`
// exigent `saisie.id`, qu'aucun formulaire ne collecte. Les contrôles concernés
// restent comptés fantômes, à raison. C'est une dette du CONTRAT, pas de
// l'instrument.
//
// ── CE QUE CE MODULE NE FAIT PAS
// Il ne contourne AUCUN contrôle. Il ne touche qu'aux VALEURS SAISIES ; la
// détection reste identique — une pression sans navigation, sans écriture et
// sans appel de capability est toujours un fantôme. Un contrôle réellement mort
// le reste, et le cliquet garde toute sa capacité de détection.
// ────────────────────────────────────────────────────────────────────────

export interface AssertionData {
  readonly fieldId: string;
  readonly operator: string;
  readonly value?: unknown;
}

/** Valeur historique — conservée comme repli, pour ne rien changer là où rien ne l'exige. */
export const VALEUR_PAR_DEFAUT = "0700000000";

/**
 * Candidats essayés dans l'ORDRE. Le premier qui satisfait TOUTES les
 * assertions du champ est retenu ; à défaut, la valeur historique.
 */
const CANDIDATS: readonly string[] = ["1", "2026-01-01", "a@b.co", VALEUR_PAR_DEFAUT, "x"];

/**
 * Sémantique RÉPLIQUÉE de `reglesRespectees` du runtime (D-062). Toute
 * divergence ferait mentir l'instrument : le cliquet de la gate la vérifie.
 */
export function satisfait(valeur: string, a: AssertionData): boolean {
  const n = Number(valeur);
  switch (a.operator) {
    case "required":
      return valeur.trim() !== "";
    case "eq":
      return String(valeur) === String(a.value);
    case "neq":
      return String(valeur) !== String(a.value);
    case "gt":
      return n > Number(a.value);
    case "gte":
      return n >= Number(a.value);
    case "lt":
      return n < Number(a.value);
    case "lte":
      return n <= Number(a.value);
    case "in":
      return Array.isArray(a.value) && a.value.map((x) => String(x)).includes(valeur);
    case "matches":
      return typeof a.value === "string" && new RegExp(a.value).test(valeur);
    default:
      // Opérateur inconnu : on ne prétend pas savoir. Le candidat n'est pas
      // disqualifié — l'instrument ne doit jamais être plus sévère que le moteur.
      return true;
  }
}

/**
 * Valeur à saisir dans un champ, compte tenu des règles du document.
 *
 * Un champ SANS assertion garde la valeur historique : la correction est
 * chirurgicale, elle ne déplace que ce que la cause démontrée exige.
 */
export function valeurPourChamp(
  fieldId: string,
  assertions: readonly AssertionData[],
): string {
  const propres = assertions.filter((a) => a.fieldId === fieldId);
  if (propres.length === 0) return VALEUR_PAR_DEFAUT;
  // Une énumération donne directement une valeur admissible ; on l'essaie d'abord.
  const enumere = propres.find((a) => a.operator === "in" && Array.isArray(a.value));
  const premiere =
    enumere !== undefined && Array.isArray(enumere.value) && enumere.value.length > 0
      ? [String(enumere.value[0])]
      : [];
  const liste = [...premiere, ...CANDIDATS];
  return liste.find((c) => propres.every((a) => satisfait(c, a))) ?? VALEUR_PAR_DEFAUT;
}

/** Extrait le `fieldId` d'un `testID` de champ (`<bloc>-field-<fieldId>`). */
export function champDuTestID(testID: unknown): string | undefined {
  if (typeof testID !== "string") return undefined;
  const part = testID.split("-field-")[1];
  return part === undefined || part === "" ? undefined : part;
}
