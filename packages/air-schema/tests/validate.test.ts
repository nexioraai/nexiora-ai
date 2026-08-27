import { describe, expect, it } from "vitest";
import type { ProjectAir } from "../src";
import { AirSemanticError, assertValidAir, validateAir } from "../src";
import { at } from "./at";
import { buildValidAir } from "./fixtures";

const codes = (air: ProjectAir): string[] => validateAir(air).map((d) => d.code);

describe("validateAir — cohérence référentielle", () => {
  it("retourne zéro diagnostic sur l'AIR de référence", () => {
    expect(validateAir(buildValidAir())).toEqual([]);
  });

  it("détecte un identifiant dupliqué entre familles de nœuds", () => {
    const air = buildValidAir();
    at(at(air.screens, 1).blocks, 1).id = at(at(air.screens, 0).blocks, 0).id;
    expect(codes(air)).toContain("AIR_DUP_ID");
  });

  it("détecte un écran d'entrée inconnu", () => {
    const air = buildValidAir();
    air.navigation.entryScreenId = "scr_fantome";
    expect(codes(air)).toContain("AIR_NAV_ENTRY_UNKNOWN");
  });

  it("détecte une route vers un écran inconnu", () => {
    const air = buildValidAir();
    at(air.navigation.routes, 1).screenId = "scr_fantome";
    expect(codes(air)).toContain("AIR_NAV_SCREEN_UNKNOWN");
  });

  it("détecte une liaison de bloc vers une entité inconnue", () => {
    const air = buildValidAir();
    at(at(air.screens, 0).blocks, 0).entityId = "ent_fantome";
    expect(codes(air)).toContain("AIR_BLOCK_ENTITY_UNKNOWN");
  });

  it("détecte un champ enum sans valeurs et un enumValues égaré", () => {
    const air = buildValidAir();
    delete at(at(air.entities, 0).fields, 2).enumValues;
    at(at(air.entities, 0).fields, 0).enumValues = ["x"];
    const found = codes(air);
    expect(found).toContain("AIR_FIELD_ENUM_VALUES_MISSING");
    expect(found).toContain("AIR_FIELD_ENUM_VALUES_UNEXPECTED");
  });

  it("détecte une référence de champ sans cible ou vers une entité inconnue", () => {
    const air = buildValidAir();
    delete at(at(air.entities, 1).fields, 1).referencesEntityId;
    expect(codes(air)).toContain("AIR_FIELD_REFERENCE_TARGET_MISSING");

    const air2 = buildValidAir();
    at(at(air2.entities, 1).fields, 1).referencesEntityId = "ent_fantome";
    expect(codes(air2)).toContain("AIR_FIELD_REFERENCE_TARGET_UNKNOWN");
  });

  it("détecte une relation vers une entité inconnue", () => {
    const air = buildValidAir();
    at(air.relations, 0).toEntityId = "ent_fantome";
    expect(codes(air)).toContain("AIR_REL_ENTITY_UNKNOWN");
  });

  it("détecte un dataset vers une entité inconnue", () => {
    const air = buildValidAir();
    at(air.datasets, 0).entityId = "ent_fantome";
    expect(codes(air)).toContain("AIR_DATASET_ENTITY_UNKNOWN");
  });

  it("détecte un déclencheur UI vers un bloc inconnu", () => {
    const air = buildValidAir();
    at(air.actions, 0).trigger = { kind: "ui", blockId: "blk_fantome" };
    expect(codes(air)).toContain("AIR_ACTION_TRIGGER_BLOCK_UNKNOWN");
  });

  it("détecte un effet capability NON DÉCLARÉE (allowlist positive)", () => {
    const air = buildValidAir();
    at(air.actions, 0).effect = { kind: "capability", capability: "camera", method: "scan" };
    expect(codes(air)).toContain("AIR_ACTION_CAPABILITY_UNDECLARED");
  });

  it("détecte un effet slot vers un slot inconnu", () => {
    const air = buildValidAir();
    at(air.actions, 1).effect = { kind: "slot", slotId: "slot_fantome" };
    expect(codes(air)).toContain("AIR_ACTION_SLOT_UNKNOWN");
  });

  it("détecte une règle sur une entité inconnue puis un champ hors entité", () => {
    const air = buildValidAir();
    at(air.rules, 0).entityId = "ent_fantome";
    expect(codes(air)).toContain("AIR_RULE_ENTITY_UNKNOWN");

    const air2 = buildValidAir();
    at(at(air2.rules, 0).assertions, 0).fieldId = "fld_order_status";
    expect(codes(air2)).toContain("AIR_RULE_FIELD_UNKNOWN");
  });

  it("détecte une permission exigée par une capability non déclarée", () => {
    const air = buildValidAir();
    at(air.permissions, 0).requiredByCapability = "camera";
    expect(codes(air)).toContain("AIR_PERMISSION_CAPABILITY_UNDECLARED");
  });

  it("détecte une clé de configuration à l'allure de secret (fail-closed)", () => {
    const air = buildValidAir();
    at(air.integrations, 0).config = { stripe_api_key: "sk_test_x" };
    expect(codes(air)).toContain("AIR_INTEGRATION_SECRET_LIKE_KEY");

    const air2 = buildValidAir();
    at(air2.integrations, 0).config = { options: { accessToken: "x" } };
    expect(codes(air2)).toContain("AIR_INTEGRATION_SECRET_LIKE_KEY");
  });

  it("refuse un PSP quand la classe commerce est digital (IAP obligatoire)", () => {
    const air = buildValidAir();
    air.compliance.commerceClass = "digital";
    expect(codes(air)).toContain("AIR_COMMERCE_DIGITAL_PSP_FORBIDDEN");
  });

  it("détecte un texte localisé sans la locale par défaut", () => {
    const air = buildValidAir();
    at(air.screens, 0).title = { en: "Menu" };
    expect(codes(air)).toContain("AIR_L10N_MISSING_DEFAULT");
  });

  it("détecte une locale par défaut absente des locales de l'app", () => {
    const air = buildValidAir();
    air.app.locales.defaultAppLocale = "en";
    air.app.locales.appLocales = ["fr"];
    expect(codes(air)).toContain("AIR_LOCALE_DEFAULT_NOT_DECLARED");
  });

  it("détecte une cible de test attendue inconnue", () => {
    const air = buildValidAir();
    at(air.expectedTests, 0).targetId = "act_fantome";
    expect(codes(air)).toContain("AIR_TEST_TARGET_UNKNOWN");
  });

  it("produit une sortie triée déterministe", () => {
    const air = buildValidAir();
    air.navigation.entryScreenId = "scr_fantome";
    at(air.datasets, 0).entityId = "ent_fantome";
    const first = validateAir(air);
    const second = validateAir(air);
    expect(first).toEqual(second);
    const paths = first.map((d) => d.path);
    expect(paths).toEqual([...paths].sort());
  });
});

describe("assertValidAir", () => {
  it("retourne l'AIR quand schéma et sémantique passent", () => {
    expect(assertValidAir(buildValidAir()).projectId).toBe("prj_resto_demo");
  });

  it("lève AirSemanticError avec les diagnostics quand la sémantique échoue", () => {
    const air = buildValidAir();
    air.navigation.entryScreenId = "scr_fantome";
    try {
      assertValidAir(air);
      expect.unreachable("aurait dû lever");
    } catch (error) {
      expect(error).toBeInstanceOf(AirSemanticError);
      expect((error as AirSemanticError).diagnostics[0]?.code).toBe("AIR_NAV_ENTRY_UNKNOWN");
    }
  });
});
