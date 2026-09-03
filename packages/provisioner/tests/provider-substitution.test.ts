// SUBSTITUTION DE PROVIDER — PREUVE D'EXÉCUTION (Phase 10, §15).
//
// Critère ROADMAP : « première abstraction provider exercée (interface +
// 1 implémentation réelle + 1 mock de substitution prouvant le
// remplacement) » et « preuve de substitution de provider SANS CHANGEMENT
// D'AIR ».
//
// PORTÉE HONNÊTE : l'implémentation RÉELLE (`SupabaseProvider`) a été
// prouvée sur un projet Supabase réel en Phase 5 (provisioning, RLS,
// teardown) ; elle n'est PAS rejouée ici — ces tests tournent hors réseau.
// Ce qui est prouvé ici, c'est le point qui manquait : le flux d'orchestration
// ne dépend d'AUCUNE implémentation concrète, et le document AIR reste
// identique quel que soit le fournisseur.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@deribfy/air-schema";
import { runProvisioning } from "../src/flow.ts";
import { MockProvisioningProvider } from "../src/mock-provider.ts";
import { ProvisioningError, type ProvisioningProvider } from "../src/provider.ts";
import { generateProvisioningSql } from "../src/sql-gen.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "..", "golden-corpus", "corpus-v2");
const air: unknown = JSON.parse(readFileSync(join(CORPUS, "resto-quartier.air.json"), "utf8"));
const { sql } = generateProvisioningSql(air);

const request = { name: "Maquis Express", sql, healthTimeoutMs: 1_000 };

describe("le flux s'exécute contre un provider SUBSTITUÉ", () => {
  it("cycle complet : création → santé → clé → SQL → démontage → absence", async () => {
    const provider = new MockProvisioningProvider();
    const report = await runProvisioning(provider, request);
    expect(report.ok).toBe(true);
    expect(report.tornDown).toBe(true);
    expect(report.steps.map((s) => s.step)).toEqual([
      "create",
      "health",
      "anon_key",
      "sql",
      "teardown",
      "absence",
    ]);
    expect(await provider.isAbsent(report.ref)).toBe(true);
  });

  it("le SQL appliqué est EXACTEMENT celui généré depuis l'AIR", () => {
    // Le fournisseur ne transforme rien : la substitution ne peut pas
    // altérer le contenu métier.
    const provider = new MockProvisioningProvider();
    return runProvisioning(provider, { ...request, keep: true }).then((report) => {
      expect(provider.appliedSql(report.ref)).toEqual([sql]);
    });
  });

  it("l'AIR n'est ni lu ni modifié par le flux (aucun changement d'AIR)", async () => {
    const avant = canonicalJson(air);
    await runProvisioning(new MockProvisioningProvider(), request);
    expect(canonicalJson(air)).toBe(avant);
  });

  it("DÉMONTAGE GARANTI même si le flux échoue en plein milieu", async () => {
    // Leçon de la Phase 8 (projet orphelin après plantage du harnais).
    const provider = new MockProvisioningProvider();
    const cassé: ProvisioningProvider = {
      createProject: (n) => provider.createProject(n),
      waitHealthy: (r, t) => provider.waitHealthy(r, t),
      getAnonKey: (r) => provider.getAnonKey(r),
      executeSql: () => Promise.reject(new ProvisioningError("SQL_BOOM", "panne simulée")),
      deleteProject: (r) => provider.deleteProject(r),
      isAbsent: (r) => provider.isAbsent(r),
    };
    const report = await runProvisioning(cassé, request);
    expect(report.ok).toBe(false);
    expect(report.steps.some((s) => !s.ok && s.detail.includes("SQL_BOOM"))).toBe(true);
    // …et pourtant le projet a bien été supprimé, absence prouvée.
    expect(report.tornDown).toBe(true);
    expect(await provider.isAbsent(report.ref)).toBe(true);
  });

  it("le substitut conserve la GARDE du vrai provider : rien qu'il n'ait créé", async () => {
    const provider = new MockProvisioningProvider();
    await expect(provider.deleteProject("ref_etranger")).rejects.toThrow(ProvisioningError);
  });

  it("déterminisme : deux exécutions produisent le même déroulé", async () => {
    const a = await runProvisioning(new MockProvisioningProvider(), request);
    const b = await runProvisioning(new MockProvisioningProvider(), request);
    expect(b.ref).toBe(a.ref);
    expect(b.steps).toEqual(a.steps);
  });

  it("aucun secret ne fuit dans le rapport", () => {
    return runProvisioning(new MockProvisioningProvider(), request).then((report) => {
      const journal = JSON.stringify(report);
      expect(journal).not.toContain("anon.");
      expect(journal).toContain("clé obtenue");
    });
  });
});

describe("cliquet provider-agnostique du flux", () => {
  it("le module de flux n'importe AUCUNE implémentation concrète", () => {
    const code = readFileSync(join(HERE, "..", "src", "flow.ts"), "utf8");
    expect(code.includes("SupabaseProvider")).toBe(false);
    expect(code.includes("MockProvisioningProvider")).toBe(false);
    expect(code.includes("fetch(")).toBe(false);
    expect(code.includes("api.supabase.com")).toBe(false);
  });
});

describe("point d'ancrage de vérification (Phase 10)", () => {
  it("la vérification s'exécute APRÈS le SQL et AVANT le démontage", async () => {
    const provider = new MockProvisioningProvider();
    const ordre: string[] = [];
    const report = await runProvisioning(provider, {
      ...request,
      verify: (p, ref) => {
        ordre.push(`verify:${provider.appliedSql(ref).length} sql appliqué(s)`);
        return Promise.resolve({ ok: true, detail: "3 tables, RLS active" });
      },
    });
    expect(ordre).toEqual(["verify:1 sql appliqué(s)"]);
    expect(report.steps.map((s) => s.step)).toEqual([
      "create",
      "health",
      "anon_key",
      "sql",
      "verify",
      "teardown",
      "absence",
    ]);
    expect(report.ok).toBe(true);
  });

  it("une vérification en échec fait ÉCHOUER le flux — et démonte quand même", async () => {
    const provider = new MockProvisioningProvider();
    const report = await runProvisioning(provider, {
      ...request,
      verify: () => Promise.resolve({ ok: false, detail: "tables ≠ entités de l'AIR" }),
    });
    expect(report.ok).toBe(false);
    expect(report.steps.some((s) => s.step === "verify" && !s.ok)).toBe(true);
    expect(report.tornDown).toBe(true);
    expect(await provider.isAbsent(report.ref)).toBe(true);
  });
});

describe("incident du 2026-08-29 — trois défauts corrigés", () => {
  /** Provider qui refuse la suppression N fois avant de l'accepter. */
  const capricieux = (echecs: number): ProvisioningProvider => {
    const socle = new MockProvisioningProvider();
    let restants = echecs;
    return {
      createProject: (n) => socle.createProject(n),
      waitHealthy: (r, t) => socle.waitHealthy(r, t),
      getAnonKey: (r) => socle.getAnonKey(r),
      executeSql: (r, sql) => socle.executeSql(r, sql),
      deleteProject: (r) => {
        if (restants > 0) {
          restants -= 1;
          return Promise.reject(new ProvisioningError("PROV_DELETE", "suppression refusée (400)"));
        }
        return socle.deleteProject(r);
      },
      isAbsent: (r) => socle.isAbsent(r),
    };
  };

  it("l'ÉTAPE en échec est nommée exactement (plus de devinette)", async () => {
    // Cas réel de l'incident : la panne survient pendant l'attente de santé.
    // Le journal la consignait comme un échec « sql ».
    const socle = new MockProvisioningProvider();
    const provider: ProvisioningProvider = {
      createProject: (n) => socle.createProject(n),
      waitHealthy: () => Promise.reject(new ProvisioningError("NET", "fetch failed")),
      getAnonKey: (r) => socle.getAnonKey(r),
      executeSql: (r, sql) => socle.executeSql(r, sql),
      deleteProject: (r) => socle.deleteProject(r),
      isAbsent: (r) => socle.isAbsent(r),
    };
    const report = await runProvisioning(provider, request);
    const echec = report.steps.find((s) => !s.ok);
    expect(echec?.step).toBe("health");
    expect(echec?.detail).toContain("fetch failed");
  });

  it("le démontage INSISTE : un refus transitoire ne laisse pas de projet vivant", async () => {
    const report = await runProvisioning(capricieux(2), request);
    expect(report.steps.find((s) => s.step === "teardown")?.ok).toBe(true);
    expect(report.steps.find((s) => s.step === "teardown")?.detail).toContain("tentative 3");
    expect(report.tornDown).toBe(true);
  });

  it("après épuisement des tentatives, l'ABSENCE est quand même vérifiée et DITE", async () => {
    const report = await runProvisioning(capricieux(99), request);
    const teardown = report.steps.find((s) => s.step === "teardown");
    const absence = report.steps.find((s) => s.step === "absence");
    expect(teardown?.ok).toBe(false);
    expect(teardown?.detail).toContain("3 tentatives échouées");
    // Le projet est encore là : le rapport doit le dire, pas le taire.
    expect(absence?.ok).toBe(false);
    expect(absence?.detail).toContain("ENCORE listé");
    expect(report.tornDown).toBe(false);
  });
});
