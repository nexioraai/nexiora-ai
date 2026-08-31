// Fixtures MINIMALES et NEUTRES — aucun vocabulaire métier (cliquet
// `agnostic.test.ts` le vérifie mécaniquement). Les identifiants sont
// délibérément abstraits : un test qui parlerait de restaurants ou de
// conteneurs ferait entrer un domaine dans le paquet.
import type { ProjectAir } from "@deribfy/air-schema";

const HASH = "0".repeat(64);

export const L = (text: string): { locale: string; text: string }[] => [
  { locale: "fr-FR", text },
];

// Les valeurs de `flatConfig` sont MUTABLES dans le schéma AIR : le helper
// doit produire exactement ce type, sinon chaque site d'appel porterait un
// cast — et un cast dans une fixture masque les vraies erreurs de contrat.
export const P = (
  record: Readonly<Record<string, string | number | boolean | string[]>>,
): { key: string; value: string | number | boolean | string[] }[] =>
  Object.entries(record).map(([key, value]) => ({ key, value }));

export const entity = (id: string, fieldCount = 2): ProjectAir["entities"][number] => ({
  id,
  name: id.slice(4),
  fields: Array.from({ length: fieldCount }, (_, i) => ({
    id: `fld_${id.slice(4)}_f${i}`,
    name: `f${i}`,
    type: "string" as const,
    required: i === 0,
  })),
});

export const dataset = (
  id: string,
  entityId: string,
  rowCount: number,
): ProjectAir["datasets"][number] => ({ id, entityId, contentHash: HASH, rowCount });

/** AIR valide MINIMAL — surchargeable champ par champ. */
export function air(overrides: Partial<ProjectAir> = {}): ProjectAir {
  return {
    airSchemaVersion: "1.1.0",
    projectId: "prj_t",
    app: {
      name: "T",
      slug: "t-app",
      locales: {
        userLanguage: "fr-FR",
        appLocales: ["fr-FR"],
        defaultAppLocale: "fr-FR",
        contentLocales: ["fr-FR"],
        rtlSupported: false,
      },
    },
    screens: [
      {
        id: "scr_a",
        title: L("A"),
        blocks: [{ id: "blk_a_h", blockType: "header", props: P({ title: "A" }) }],
      },
    ],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    entities: [],
    relations: [],
    datasets: [],
    actions: [],
    rules: [],
    slots: [],
    capabilities: [],
    permissions: [],
    design: { theme: "t_theme" },
    integrations: [],
    network: { policy: "deny_by_default", allowedDomains: [] },
    native: { minIosVersion: "16.4", minAndroidSdk: 26 },
    compliance: {
      commerceClass: "none",
      accountDeletionRequired: false,
      dataCollected: [],
    },
    expectedTests: [],
    ...overrides,
  };
}
