// CONTRAT SANDBOX PROVIDER (6.1, D-034 / D-033 — ARCHITECTURE §8/§15).
// Interface PROVIDER-AGNOSTIC : le moteur (pipeline, Oracle) parle
// uniquement à cette interface — jamais au SDK d'un provider concret
// (non-négociable #12). Les adaptateurs Modal (D-033, choix #1) et E2B
// (repli) l'implémentent ; les remplacer ne touche pas le cœur.
// La surface ci-dessous est EXACTEMENT celle prouvée réalisable par les
// DEUX providers au banc P-002 (E1-E5) : création, upload, exec, politique
// réseau, timeout, terminaison, preuve d'absence — donc générique par
// construction, pas taillée pour un provider.

/** Politique réseau (§8 « réseau contrôlé »). Deux modes exclusifs :
 *  - `{ mode: "block_all" }` : aucun egress (défaut sûr) ;
 *  - `{ mode: "allowlist", domains }` : seuls ces domaines sortants.
 *  Les deux providers du banc supportent domaine + coupure totale. */
export type NetworkPolicy =
  | { mode: "block_all" }
  | { mode: "allowlist"; domains: readonly string[] };

/** Spécification d'un sandbox éphémère (§8). AUCUN secret : le champ
 *  n'existe pas — le contrat rend structurellement impossible d'injecter
 *  un secret dans un sandbox (preuve « sandbox sans secrets », 6.5). */
export interface SandboxSpec {
  /** Étiquette lisible pour les journaux (jamais un secret). */
  readonly label: string;
  /** Politique réseau. Défaut recommandé : allowlist du registre npm. */
  readonly network: NetworkPolicy;
  /** Ressources (indicatives ; l'adaptateur mappe au provider). */
  readonly vcpu?: number;
  readonly memoryMiB?: number;
  /** Timeout dur de vie du sandbox (ms). */
  readonly timeoutMs: number;
}

/** Fichier téléversé dans le sandbox (contenu binaire ou texte). */
export interface UploadEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** Résultat d'exécution d'une commande. `timedOut` distingue un dépassement
 *  du timeout d'un simple exit≠0 (les deux SDK diffèrent — normalisé ici). */
export interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
}

/** Poignée opaque d'un sandbox créé. `id` sert à la preuve d'absence. */
export interface SandboxHandle {
  readonly id: string;
}

export interface ExecOptions {
  readonly timeoutMs?: number;
}

/** Erreur normalisée du provider (les codes SDK bruts ne fuitent pas). */
export class SandboxProviderError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SandboxProviderError";
    this.code = code;
  }
}

/**
 * Contrat que tout provider de sandbox implémente. Fonctions critiques
 * exigées par la ROADMAP P-002 : création, exécution, réseau/egress
 * (via SandboxSpec.network), secrets (structurellement absents), timeout,
 * terminaison, preuve d'absence/orphelins, erreurs/timeouts.
 */
export interface SandboxProvider {
  /** Nom du provider (pour les journaux/métriques). */
  readonly name: string;
  /** Crée un sandbox éphémère conforme au spec. */
  create(spec: SandboxSpec): Promise<SandboxHandle>;
  /** Téléverse des fichiers dans le sandbox. */
  upload(handle: SandboxHandle, files: readonly UploadEntry[]): Promise<void>;
  /** Exécute une commande shell ; ne LÈVE jamais sur exit≠0 (normalisé). */
  exec(handle: SandboxHandle, command: string, opts?: ExecOptions): Promise<ExecResult>;
  /** Détruit le sandbox (destruction garantie, §8). */
  terminate(handle: SandboxHandle): Promise<void>;
  /** Prouve l'absence : le sandbox n'apparaît plus dans le listing actif. */
  isAbsent(handle: SandboxHandle): Promise<boolean>;
}
