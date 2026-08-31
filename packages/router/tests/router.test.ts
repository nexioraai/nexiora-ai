// CAS-TUEURS DU ROUTEUR — Phase 11, critère « tentative de livrer en OTA un
// changement d'empreinte → REFUSÉE par le routeur (preuve par tentative) ».
//
// Un routeur qui n'a jamais été VU refuser n'est pas un routeur. Chaque test
// ci-dessous provoque un changement de nature NATIVE et exige le refus ; le
// contrôle positif prouve qu'il laisse passer ce qui doit passer, sans quoi
// « tout refuser » suffirait à faire verdir la suite.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateAirDocument, type ProjectAir } from "@deribfy/air-schema";
import { RELEASE_TRAIN_V1 } from "@deribfy/compiler";
import { RUNTIME_PROFILES, attemptOta, nativeSurface, routeUpdate } from "../src/router.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const load = (f: string): ProjectAir =>
  migrateAirDocument(JSON.parse(readFileSync(join(CORPUS, f), "utf8")));
const base = (): ProjectAir => load("resto-quartier.air.json");

describe("routeur — CONTRÔLE POSITIF : ce qui doit passer passe", () => {
  it("un document IDENTIQUE à lui-même est livrable en OTA", () => {
    const v = routeUpdate(base(), base());
    expect(v.kind).toBe("ota");
    expect(v.reasons).toEqual([]);
  });

  it("un changement PUREMENT UI est livrable en OTA", () => {
    // Un libellé de bouton : rien de natif ne bouge.
    const avant = base();
    const apres = JSON.parse(JSON.stringify(avant)) as ProjectAir;
    const bloc = apres.screens[0]?.blocks.find((b) => b.blockType === "button");
    expect(bloc, "le corpus doit contenir un bouton").toBeDefined();
    const props = bloc?.props?.map((p) => (p.key === "label" ? { ...p, value: "Nouveau libellé" } : p));
    if (bloc !== undefined) (bloc as { props?: unknown }).props = props;
    const v = routeUpdate(avant, apres);
    expect(v.kind, v.reasons.join(" · ")).toBe("ota");
  });

  it("l'empreinte est DÉTERMINISTE : même document, même empreinte", () => {
    expect(nativeSurface(base()).fingerprint).toBe(nativeSurface(base()).fingerprint);
  });
});

describe("routeur — CAS-TUEURS : il doit REFUSER", () => {
  const muter = (f: (a: ProjectAir) => void): ProjectAir => {
    const a = JSON.parse(JSON.stringify(base())) as ProjectAir;
    f(a);
    return a;
  };

  it("KT-1 · AJOUT d'une capability → REBUILD, jamais OTA", () => {
    const apres = muter((a) => {
      (a.capabilities as { capability: string }[]).push({ capability: "camera" });
    });
    const t = attemptOta(base(), apres, "production");
    expect(t.accepted, "une capability ajoutée ne peut PAS partir en OTA").toBe(false);
    expect(t.reasons.join(" ")).toContain("camera");
  });

  it("KT-2 · RETRAIT d'une capability → REBUILD", () => {
    const avant = base();
    expect(avant.capabilities.length, "le document doit déclarer des capabilities").toBeGreaterThan(0);
    const apres = muter((a) => {
      (a as { capabilities: unknown[] }).capabilities = a.capabilities.slice(1);
    });
    expect(routeUpdate(avant, apres).kind).toBe("rebuild");
  });

  it("KT-3 · AJOUT d'une permission → REBUILD", () => {
    const apres = muter((a) => {
      (a.permissions as unknown[]).push({
        platform: "android",
        permission: "android.permission.CAMERA",
        reason: [{ locale: a.app.locales.defaultAppLocale, text: "photo du plat" }],
        requiredByCapability: a.capabilities[0]?.capability ?? "analytics",
      });
    });
    const v = routeUpdate(base(), apres);
    expect(v.kind).toBe("rebuild");
    expect(v.reasons.join(" ")).toContain("permission");
  });

  it("KT-4 · MONTÉE du plancher d'OS → REBUILD", () => {
    const apres = muter((a) => {
      (a.native as { minAndroidSdk: number }).minAndroidSdk = a.native.minAndroidSdk + 5;
    });
    const v = routeUpdate(base(), apres);
    expect(v.kind).toBe("rebuild");
    expect(v.reasons.join(" ")).toContain("Android");
  });

  it("KT-5 · CHANGEMENT DE TRAIN DE RELEASE → REBUILD, document inchangé", () => {
    // Le document ne bouge pas d'un octet : c'est la plateforme qui change.
    // Le type du train fige son `id` littéral : on passe par `unknown`, ce qui
    // est exactement ce qu'un train FUTUR sera au regard du type d'aujourd'hui.
    const autre = { ...RELEASE_TRAIN_V1, id: "rt-2027.01" } as unknown as typeof RELEASE_TRAIN_V1;
    // Le document est le MÊME des deux côtés ; seul le train change.
    const v = routeUpdate(base(), base(), RELEASE_TRAIN_V1, autre);
    expect(v.kind, "changer de train impose un binaire neuf").toBe("rebuild");
  });

  it("KT-6 · AUCUNE COMPENSATION : un seul changement natif suffit", () => {
    // Un changement UI parfaitement livrable + un changement natif : le verdict
    // est REBUILD. Le routeur ne moyenne pas, il conjugue.
    const apres = muter((a) => {
      const b = a.screens[0]?.blocks.find((x) => x.blockType === "button");
      if (b !== undefined) (b as { props?: unknown }).props = b.props?.map((p) => (p.key === "label" ? { ...p, value: "X" } : p));
      (a.capabilities as { capability: string }[]).push({ capability: "maps" });
    });
    expect(routeUpdate(base(), apres).kind).toBe("rebuild");
  });
});

describe("routeur — profils de runtime versionnés", () => {
  it("les profils sont ordonnés par surface native CROISSANTE", () => {
    expect([...RUNTIME_PROFILES]).toEqual(["core", "standard", "extended"]);
  });

  it("chaque document du corpus reçoit un profil, et il est stable", () => {
    for (const f of readdirSync(CORPUS).filter((x) => x.endsWith(".air.json"))) {
      const s = nativeSurface(load(f));
      expect(RUNTIME_PROFILES, f).toContain(s.profile);
      expect(nativeSurface(load(f)).profile, f).toBe(s.profile);
    }
  });

  it("un document SANS capability reste en `core` — aucun module natif optionnel", () => {
    const nu = JSON.parse(JSON.stringify(base())) as ProjectAir;
    (nu as { capabilities: unknown[] }).capabilities = [];
    (nu as { permissions: unknown[] }).permissions = [];
    const s = nativeSurface(nu);
    expect(s.profile).toBe("core");
    expect(s.nativeModules).toEqual([]);
  });
});
