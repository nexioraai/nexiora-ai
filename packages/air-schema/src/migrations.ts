import type { ProjectAir } from "./air";
import { AIR_SCHEMA_VERSION } from "./air";
import { assertValidAir } from "./validate";

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
export const AIR_MIGRATIONS: readonly AirMigration[] = [];

export class AirMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirMigrationError";
  }
}

export function migrateAirDocument(
  input: unknown,
  migrations: readonly AirMigration[] = AIR_MIGRATIONS,
): ProjectAir {
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

  return assertValidAir(document);
}
