// PIPELINE DE LIGNES D'UNE LISTE (E1/E2, D-129) — module PUR, zéro import.
//
// POURQUOI UN MODULE SÉPARÉ : la logique de visibilité des lignes doit être
// PROUVABLE par tests unitaires sans monter react-native. `AirList` ne fait
// plus que tenir les états de saisie et déléguer ici — le composant reste
// mince, la vérité est testable.
//
// ORDRE VOLONTAIRE (D-065 étendu) : périmètre relationnel (E2), puis
// recherche, puis filtres (littéral + pilotés, CONJONCTION), puis tri, puis
// borne. Fermé par construction : trois opérateurs, une direction, une borne,
// au plus trois filtres — aucune expression arbitraire n'entre jamais.

export interface LigneListe {
  readonly id: string;
  readonly values: Readonly<Record<string, string>>;
}

export type OperateurFiltre = "eq" | "neq" | "contains";

export interface FiltreEffectif {
  readonly fieldId: string;
  readonly operator: OperateurFiltre;
  /** Valeur du document (littéral) ou saisie de l'utilisateur (piloté). */
  readonly valeur: string;
}

export interface ParametresPipeline {
  /**
   * E2 — PORTÉE RELATIONNELLE. Si `scopeFieldId` est déclaré, seules les
   * lignes dont ce champ vaut `instanceId` sont visibles. SANS instance
   * courante, une liste scopée est VIDE — jamais de repli silencieux vers un
   * autre parent (la classe « premier enregistrement en silence » ne doit pas
   * renaître ici ; D-129).
   */
  readonly scopeFieldId?: string;
  readonly instanceId?: string;
  readonly rechercheChamp?: string;
  readonly recherche?: string;
  /** Filtres effectifs, littéral inclus — un filtre à valeur vide est INACTIF. */
  readonly filtres?: readonly FiltreEffectif[];
  readonly triChamp?: string;
  readonly triDesc?: boolean;
  readonly borne?: number;
}

const passeFiltre = (v: string, f: FiltreEffectif): boolean =>
  f.operator === "neq" ? v !== f.valeur : f.operator === "contains" ? v.includes(f.valeur) : v === f.valeur;

export function lignesVisibles(
  instances: readonly LigneListe[],
  p: ParametresPipeline,
): readonly LigneListe[] {
  const scopees =
    p.scopeFieldId === undefined
      ? instances
      : p.instanceId === undefined
        ? []
        : instances.filter((i) => (i.values[p.scopeFieldId as string] ?? "") === p.instanceId);
  const saisie = (p.recherche ?? "").trim().toLowerCase();
  const cherchees =
    p.rechercheChamp === undefined || saisie === ""
      ? scopees
      : scopees.filter((i) =>
          (i.values[p.rechercheChamp as string] ?? "").toLowerCase().includes(saisie),
        );
  const actifs = (p.filtres ?? []).filter((f) => f.valeur !== "");
  const filtrees = actifs.reduce(
    (lignes, f) => lignes.filter((i) => passeFiltre(i.values[f.fieldId] ?? "", f)),
    cherchees,
  );
  const triees =
    p.triChamp === undefined
      ? filtrees
      : [...filtrees].sort((x, y) => {
          const a = x.values[p.triChamp as string] ?? "";
          const c = y.values[p.triChamp as string] ?? "";
          const na = Number(a);
          const nc = Number(c);
          const ordre = Number.isFinite(na) && Number.isFinite(nc) ? na - nc : a.localeCompare(c);
          return p.triDesc === true ? -ordre : ordre;
        });
  return p.borne === undefined ? triees : triees.slice(0, p.borne);
}

/** Valeurs distinctes d'un champ sur le périmètre déjà scopé — options `choice`. */
export function optionsDistinctes(
  instances: readonly LigneListe[],
  fieldId: string,
): readonly string[] {
  return [...new Set(instances.map((i) => i.values[fieldId] ?? "").filter((v) => v !== ""))].sort();
}
