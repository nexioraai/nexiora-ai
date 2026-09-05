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
  {
    from: "1.1.0",
    to: "1.2.0",
    description:
      "AIR 1.2.0 (D-056) : ajout du champ OPTIONNEL `intent` — la demande du " +
      "client et les besoins qu'elle exprime. La migration est une IDENTITÉ : " +
      "un document 1.1.0 ne porte AUCUNE trace de la demande qui l'a produit, " +
      "et lui en inventer une fabriquerait la seule chose que ce champ existe " +
      "pour ne plus perdre. Un corpus migré reste donc SANS intention — c'est " +
      "le FAIT, et la gate de fidélité le refusera comme tel.",
    migrate: (document) => document,
  },
  {
    from: "1.2.0",
    to: "1.3.0",
    description:
      "AIR 1.3.0 (D-058) : ajout du champ OPTIONNEL `binding` sur l'effet " +
      "`slot` — d'où viennent ses entrées, où vont ses sorties. Identité : un " +
      "document 1.2.0 ne portait aucune liaison, et lui en inventer une " +
      "reviendrait à DEVINER ce qu'un slot consomme et produit. Un slot sans " +
      "liaison reste donc NON INVOQUÉ après migration — c'est le FAIT, et la " +
      "gate de fidélité continue de compter sa promesse comme morte.",
    migrate: (document) => document,
  },
  {
    from: "1.3.0",
    to: "1.4.0",
    description:
      "AIR 1.4.0 (D-064) : ajout du champ OPTIONNEL `referenceDisplayFieldId` " +
      "sur les champs — QUEL champ de l'entité cible afficher à la place de " +
      "l'identifiant brut. Identité : choisir la cible à la place du document " +
      "serait une convention, donc une supposition. Un champ `reference` sans " +
      "ce pointeur continue d'afficher son identifiant — c'est le FAIT.",
    migrate: (document) => document,
  },
  {
    from: "1.4.0",
    to: "1.5.0",
    description:
      "AIR 1.5.0 (D-070) : ajout du champ OPTIONNEL `thenScreenId` sur l'effet " +
      "`mutation` — où aller une fois l'écriture faite. Identité : un document " +
      "1.4.0 ne demandait aucune navigation après écriture, et lui en inventer " +
      "une changerait le parcours de l'utilisateur sans décision.",
    migrate: (document) => document,
  },
  {
    from: "1.5.0",
    to: "1.6.0",
    description:
      "AIR 1.6.0 (D-086) : ajout du champ OPTIONNEL `navigation.primary` — les " +
      "destinations principales et leur ordre. Identité : choisir quelles " +
      "destinations sont principales À LA PLACE du document reviendrait à " +
      "décider de son architecture. Un document sans `primary` ne rend aucune " +
      "barre — comportement 1.5.0 inchangé au caractère près.",
    migrate: (document) => document,
  },
  {
    from: "1.6.0",
    to: "1.7.0",
    description:
      "AIR 1.7.0 (E3.2, D-130) : ajout du champ OPTIONNEL `dataset.source` — " +
      "seed | remote(integrationId, domain, refreshSeconds?). Identité : un " +
      "document 1.6.0 n'a déclaré aucune provenance, et lui en inventer une " +
      "prétendrait une vivacité que rien ne fonde. Sans `source`, le dataset " +
      "reste amorcé à la compilation — comportement 1.6.0 au caractère près.",
    migrate: (document) => document,
  },
  {
    from: "1.7.0",
    to: "1.7.1",
    description:
      "AIR 1.7.1 (E3.3, D-131) : APLANISSEMENT de la provenance — l'union " +
      "`dataset.source` de 1.7.0 était refusée par l'API réelle à tous les " +
      "niveaux de l'échelle (« compiled grammar is too large », classe D-078, " +
      "sonde différentielle du 2026-09-02) ; forme plate sourceKind/" +
      "sourceIntegrationId/sourceDomain/sourceRefreshSeconds, sémantique " +
      "E3.2 inchangée (superRefine + fail-closed). Identité : AUCUN document " +
      "(corpus, fixtures, journaux) n'a jamais porté la forme union — un " +
      "document qui la porterait est REFUSÉ au parse (clé inconnue, " +
      "fail-closed), jamais transformé en silence.",
    migrate: (document) => document,
  },
  {
    from: "1.7.1",
    to: "1.8.0",
    description:
      "AIR 1.8.0 (phase 3, refonte UX) : ajout du champ OPTIONNEL " +
      "`navigation.primary.destinations[].icon` — énumération FERMÉE de " +
      "glyphes que le moteur sait dessiner, embarqués, sans accès réseau. " +
      "Migration IDENTITÉ : aucune icône n'est inventée pour un document qui " +
      "n'en déclare pas. Choisir l'icône d'un onglet à sa place reviendrait à " +
      "décider de son identité visuelle — exactement ce que la migration de " +
      "`navigation.primary` (1.6.0) avait déjà refusé. Un document sans " +
      "`icon` se rend donc EXACTEMENT comme avant, ce que le cliquet de " +
      "compatibilité ascendante vérifie au lieu de le déclarer.",
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
