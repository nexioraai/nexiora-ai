import type { ProjectAir } from "./air.ts";
import { AIR_SCHEMA_VERSION } from "./air.ts";
import { assertValidAir } from "./validate.ts";

// Migrations d'AIR (ARCHITECTURE §1) : testées comme les migrations SQL du
// dépôt — chaque étape est pure, totale, versionnée. Un AIR d'une version
// antérieure est migré pas à pas jusqu'à la version courante, puis DOIT
// passer schéma + validateur sémantique (fail-closed).
export interface AirMigration {
  from: string;
  to: string;
  description: string;
  migrate: (document: Record<string, unknown>) => Record<string, unknown>;
}

// v1.0.0 est la première version publiée du schéma : le registre est vide
// par construction. Le mécanisme, lui, est en place et testé dès maintenant
// (ROADMAP Phase 2) — la v1.1 n'improvisera pas.
export const AIR_MIGRATIONS: readonly AirMigration[] = [
  {
    from: "1.0.0",
    to: "1.1.0",
    description:
      "AIR 1.1.0 (D-044) : ajout du champ OPTIONNEL `visibleWhen` sur les blocs. " +
      "La migration est une IDENTITÉ sur les données — un document 1.0.0 ne " +
      "portait aucune condition, et la migration n'en INVENTE aucune : lui en " +
      "attribuer reviendrait à réinterpréter un artefact gelé sans décision. " +
      "Seule la version est portée à 1.1.0, par le runner lui-même.",
    migrate: (document) => document,
  },
];

export class AirMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirMigrationError";
  }
}

/**
 * Applique la CHAÎNE de migrations, sans valider.
 *
 * Séparé de `migrateAirDocument` parce que les deux besoins sont réellement
 * distincts : un appelant qui veut « un AIR courant garanti » veut aussi la
 * validation ; le chemin de compilation, lui, valide DÉJÀ juste après, et
 * doit conserver ses diagnostics PRÉCIS. Fusionner les deux faisait
 * s'effondrer toute erreur de schéma en un « migration échouée » — perte de
 * précision constatée, donc refusée.
 */
export function applyAirMigrations(
  input: unknown,
  migrations: readonly AirMigration[] = AIR_MIGRATIONS,
): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new AirMigrationError("document AIR attendu : objet JSON");
  }
  let document = input as Record<string, unknown>;
  const declared = document.airSchemaVersion;
  if (typeof declared !== "string") {
    throw new AirMigrationError("airSchemaVersion manquant ou non textuel");
  }
  let current = declared;
  const visited = new Set<string>();
  while (current !== AIR_SCHEMA_VERSION) {
    if (visited.has(current)) {
      throw new AirMigrationError(`cycle de migrations détecté à "${current}"`);
    }
    visited.add(current);
    const step = migrations.find((m) => m.from === current);
    if (step === undefined) {
      throw new AirMigrationError(
        `aucune migration depuis "${current}" vers "${AIR_SCHEMA_VERSION}"`,
      );
    }
    // Le runner fixe la version cible lui-même : une migration ne peut pas
    // « sauter » de version en silence.
    document = { ...step.migrate(document), airSchemaVersion: step.to };
    current = step.to;
  }
  return document;
}

export function migrateAirDocument(
  input: unknown,
  migrations: readonly AirMigration[] = AIR_MIGRATIONS,
): ProjectAir {
  return assertValidAir(applyAirMigrations(input, migrations));
}
