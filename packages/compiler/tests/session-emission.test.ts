// L'ÉMISSION CHOISIT LA BONNE SESSION — et ne se trompe jamais en faveur du
// vérifié. Un document qui ne déclare AUCUN serveur d'identité ne doit pas
// produire une app qui prétend en interroger un.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileProject } from "../src/compile-project.ts";
import { migrateAirDocument } from "@deribfy/air-schema";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = join(HERE, "..", "..", "..", "slices", "validation-appareil", "validation-appareil.air.json");

const charger = (): Record<string, unknown> =>
  JSON.parse(readFileSync(DOC, "utf8")) as Record<string, unknown>;

const app = (air: unknown): string =>
  String(compileProject(migrateAirDocument(air)).files.get("App.tsx"));

describe("émission de la session — le document décide, jamais le moteur", () => {
  it("SANS intégration d'authentification : session LOCALE, aucun client réseau", () => {
    const code = app(charger());
    expect(code).toContain("creerSessionLocale");
    expect(code).toContain("creerCapabilitesAuth(");
    // Le piège : émettre un client Supabase sans savoir où le joindre.
    expect(code).not.toContain("@supabase/supabase-js");
    expect(code).not.toContain("creerSessionSupabase");
  });

  it("AVEC intégration déclarée : session VÉRIFIÉE, client construit sur le document", () => {
    const air = charger() as { integrations: unknown[] };
    air.integrations = [
      ...air.integrations,
      {
        id: "intg_auth",
        providerClass: "auth",
        capability: "auth",
        config: [
          { key: "url", value: "https://exemple-projet.supabase.co" },
          { key: "anonKey", value: "cle-anonyme-publiable" },
        ],
      },
    ];
    const code = app(air);
    expect(code).toContain("creerSessionSupabase");
    expect(code).toContain("creerCapabilitesAuthVerifiee");
    expect(code).toContain("https://exemple-projet.supabase.co");
    // L'implémentation locale QUITTE l'artefact : deux sessions coexistantes
    // seraient une ambiguïté, pas une souplesse.
    expect(code).not.toContain("creerSessionLocale");
  });

  it("intégration INCOMPLÈTE (url sans clé) : on RETOMBE en local, sans rien prétendre", () => {
    const air = charger() as { integrations: unknown[] };
    air.integrations = [
      ...air.integrations,
      {
        id: "intg_auth",
        providerClass: "auth",
        capability: "auth",
        config: [{ key: "url", value: "https://exemple-projet.supabase.co" }],
      },
    ];
    const code = app(air);
    expect(code).toContain("creerSessionLocale");
    expect(code).not.toContain("creerSessionSupabase");
  });

  it("déterminisme : même document, même App.tsx", () => {
    expect(app(charger())).toBe(app(charger()));
  });
});
