import type { ProjectAir } from "./air.ts";
import { projectAirSchema } from "./air.ts";

// Validateur sémantique DÉTERMINISTE (ARCHITECTURE §1) : un AIR émis par LLM
// est syntaxiquement valide par construction (structured outputs) ; la
// cohérence référentielle, elle, se vérifie ici — jamais par un LLM.
export interface AirDiagnostic {
  code: string;
  path: string;
  message: string;
}

// Aucun secret dans l'AIR (non-négociable #13) : détection fail-closed sur
// les noms de clés de configuration.
const SECRET_LIKE_KEY = /(secret|token|password|api_?key|private_?key|credential)/i;

export function validateAir(air: ProjectAir): AirDiagnostic[] {
  const diagnostics: AirDiagnostic[] = [];
  const push = (code: string, path: string, message: string): void => {
    diagnostics.push({ code, path, message });
  };

  const screenIds = new Set(air.screens.map((s) => s.id));
  const blockIds = new Set(air.screens.flatMap((s) => s.blocks.map((b) => b.id)));
  const entityById = new Map(air.entities.map((e) => [e.id, e]));
  const slotIds = new Set(air.slots.map((s) => s.id));
  const declaredCapabilities = new Set(air.capabilities.map((c) => c.capability));
  const defaultLocale = air.app.locales.defaultAppLocale;

  // 1. Unicité GLOBALE des identités stables — un id désigne un seul nœud.
  const seen = new Map<string, string>();
  const identities: [string, string][] = [[air.projectId, "projectId"]];
  air.screens.forEach((s, i) => {
    identities.push([s.id, `screens[${i}]`]);
    s.blocks.forEach((b, j) => {
      identities.push([b.id, `screens[${i}].blocks[${j}]`]);
    });
  });
  air.navigation.routes.forEach((r, i) => {
    identities.push([r.id, `navigation.routes[${i}]`]);
  });
  air.entities.forEach((e, i) => {
    identities.push([e.id, `entities[${i}]`]);
    e.fields.forEach((f, j) => {
      identities.push([f.id, `entities[${i}].fields[${j}]`]);
    });
  });
  air.relations.forEach((r, i) => {
    identities.push([r.id, `relations[${i}]`]);
  });
  air.datasets.forEach((d, i) => {
    identities.push([d.id, `datasets[${i}]`]);
  });
  air.actions.forEach((a, i) => {
    identities.push([a.id, `actions[${i}]`]);
  });
  air.rules.forEach((r, i) => {
    identities.push([r.id, `rules[${i}]`]);
  });
  air.slots.forEach((s, i) => {
    identities.push([s.id, `slots[${i}]`]);
  });
  air.integrations.forEach((x, i) => {
    identities.push([x.id, `integrations[${i}]`]);
  });
  air.expectedTests.forEach((t, i) => {
    identities.push([t.id, `expectedTests[${i}]`]);
  });
  for (const [id, path] of identities) {
    const first = seen.get(id);
    if (first === undefined) {
      seen.set(id, path);
    } else {
      push("AIR_DUP_ID", path, `identifiant "${id}" déjà utilisé à ${first}`);
    }
  }

  // 2. Locales : la locale par défaut appartient aux locales de l'app, et
  // tout texte localisé obligatoire la couvre.
  if (!air.app.locales.appLocales.includes(defaultLocale)) {
    push(
      "AIR_LOCALE_DEFAULT_NOT_DECLARED",
      "app.locales.defaultAppLocale",
      `locale par défaut "${defaultLocale}" absente de appLocales`,
    );
  }
  const checkLocalized = (
    text: { locale: string; text: string }[] | undefined,
    path: string,
  ): void => {
    if (text === undefined) {
      return;
    }
    if (!text.some((t) => t.locale === defaultLocale)) {
      push(
        "AIR_L10N_MISSING_DEFAULT",
        path,
        `texte localisé sans la locale par défaut "${defaultLocale}"`,
      );
    }
    const locales = new Set<string>();
    for (const t of text) {
      if (locales.has(t.locale)) {
        push("AIR_L10N_DUP_LOCALE", path, `locale "${t.locale}" présente deux fois`);
      }
      locales.add(t.locale);
    }
  };

  // Configurations plates : unicité des clés.
  const checkConfig = (
    config: { key: string; value: unknown }[] | undefined,
    path: string,
  ): void => {
    if (config === undefined) {
      return;
    }
    const keys = new Set<string>();
    config.forEach((pair, i) => {
      if (keys.has(pair.key)) {
        push("AIR_CONFIG_DUP_KEY", `${path}[${i}]`, `clé "${pair.key}" présente deux fois`);
      }
      keys.add(pair.key);
    });
  };
  air.screens.forEach((s, i) => {
    s.blocks.forEach((b, j) => {
      checkConfig(b.props, `screens[${i}].blocks[${j}].props`);
    });
  });
  air.actions.forEach((a, i) => {
    if (a.effect.kind === "capability") {
      checkConfig(a.effect.params, `actions[${i}].effect.params`);
    }
  });
  air.capabilities.forEach((c, i) => {
    checkConfig(c.config, `capabilities[${i}].config`);
  });
  checkConfig(air.design.overrides, "design.overrides");
  air.integrations.forEach((x, i) => {
    checkConfig(x.config, `integrations[${i}].config`);
  });
  air.screens.forEach((s, i) => {
    checkLocalized(s.title, `screens[${i}].title`);
  });
  air.navigation.routes.forEach((r, i) => {
    checkLocalized(r.title, `navigation.routes[${i}].title`);
  });
  air.permissions.forEach((p, i) => {
    checkLocalized(p.reason, `permissions[${i}].reason`);
  });

  // 3. Navigation : entrée et routes pointent vers des écrans existants.
  if (!screenIds.has(air.navigation.entryScreenId)) {
    push(
      "AIR_NAV_ENTRY_UNKNOWN",
      "navigation.entryScreenId",
      `écran "${air.navigation.entryScreenId}" introuvable`,
    );
  }
  air.navigation.routes.forEach((r, i) => {
    if (!screenIds.has(r.screenId)) {
      push(
        "AIR_NAV_SCREEN_UNKNOWN",
        `navigation.routes[${i}].screenId`,
        `écran "${r.screenId}" introuvable`,
      );
    }
  });

  // 4. Blocs : la liaison de données référence une entité existante.
  air.screens.forEach((s, i) => {
    s.blocks.forEach((b, j) => {
      if (b.entityId !== undefined && !entityById.has(b.entityId)) {
        push(
          "AIR_BLOCK_ENTITY_UNKNOWN",
          `screens[${i}].blocks[${j}].entityId`,
          `entité "${b.entityId}" introuvable`,
        );
      }
    });
  });

  // 5. Champs : cohérence type ↔ attributs conditionnels.
  air.entities.forEach((e, i) => {
    e.fields.forEach((f, j) => {
      const path = `entities[${i}].fields[${j}]`;
      if (f.type === "enum" && f.enumValues === undefined) {
        push("AIR_FIELD_ENUM_VALUES_MISSING", path, `champ enum "${f.id}" sans enumValues`);
      }
      if (f.type !== "enum" && f.enumValues !== undefined) {
        push("AIR_FIELD_ENUM_VALUES_UNEXPECTED", path, `enumValues sur un champ non-enum "${f.id}"`);
      }
      if (f.type === "reference") {
        if (f.referencesEntityId === undefined) {
          push("AIR_FIELD_REFERENCE_TARGET_MISSING", path, `champ reference "${f.id}" sans cible`);
        } else if (!entityById.has(f.referencesEntityId)) {
          push("AIR_FIELD_REFERENCE_TARGET_UNKNOWN", path, `entité "${f.referencesEntityId}" introuvable`);
        }
      }
      if (f.type !== "reference" && f.referencesEntityId !== undefined) {
        push("AIR_FIELD_REFERENCE_UNEXPECTED", path, `referencesEntityId sur un champ non-reference "${f.id}"`);
      }
    });
  });

  // 6. Relations et datasets : entités existantes.
  air.relations.forEach((r, i) => {
    if (!entityById.has(r.fromEntityId)) {
      push("AIR_REL_ENTITY_UNKNOWN", `relations[${i}].fromEntityId`, `entité "${r.fromEntityId}" introuvable`);
    }
    if (!entityById.has(r.toEntityId)) {
      push("AIR_REL_ENTITY_UNKNOWN", `relations[${i}].toEntityId`, `entité "${r.toEntityId}" introuvable`);
    }
  });
  air.datasets.forEach((d, i) => {
    if (!entityById.has(d.entityId)) {
      push("AIR_DATASET_ENTITY_UNKNOWN", `datasets[${i}].entityId`, `entité "${d.entityId}" introuvable`);
    }
  });

  // 7. Actions : déclencheurs et effets référencent des nœuds existants ; un
  // effet capability exige une capability DÉCLARÉE (allowlist positive, §2).
  air.actions.forEach((a, i) => {
    const t = a.trigger;
    if (t.kind === "ui" && !blockIds.has(t.blockId)) {
      push("AIR_ACTION_TRIGGER_BLOCK_UNKNOWN", `actions[${i}].trigger.blockId`, `bloc "${t.blockId}" introuvable`);
    }
    if (t.kind === "lifecycle" && t.screenId !== undefined && !screenIds.has(t.screenId)) {
      push("AIR_ACTION_TRIGGER_SCREEN_UNKNOWN", `actions[${i}].trigger.screenId`, `écran "${t.screenId}" introuvable`);
    }
    if (t.kind === "data" && !entityById.has(t.entityId)) {
      push("AIR_ACTION_TRIGGER_ENTITY_UNKNOWN", `actions[${i}].trigger.entityId`, `entité "${t.entityId}" introuvable`);
    }
    const e = a.effect;
    if (e.kind === "capability" && !declaredCapabilities.has(e.capability)) {
      push(
        "AIR_ACTION_CAPABILITY_UNDECLARED",
        `actions[${i}].effect.capability`,
        `capability "${e.capability}" non déclarée dans capabilities`,
      );
    }
    if (e.kind === "slot" && !slotIds.has(e.slotId)) {
      push("AIR_ACTION_SLOT_UNKNOWN", `actions[${i}].effect.slotId`, `slot "${e.slotId}" introuvable`);
    }
    if (e.kind === "navigate" && !screenIds.has(e.screenId)) {
      push("AIR_ACTION_SCREEN_UNKNOWN", `actions[${i}].effect.screenId`, `écran "${e.screenId}" introuvable`);
    }
    if (e.kind === "mutation" && !entityById.has(e.entityId)) {
      push("AIR_ACTION_ENTITY_UNKNOWN", `actions[${i}].effect.entityId`, `entité "${e.entityId}" introuvable`);
    }
  });

  // 8. Règles : entité existante, champs des assertions appartenant à
  // l'entité ciblée.
  air.rules.forEach((r, i) => {
    const entity = entityById.get(r.entityId);
    if (entity === undefined) {
      push("AIR_RULE_ENTITY_UNKNOWN", `rules[${i}].entityId`, `entité "${r.entityId}" introuvable`);
      return;
    }
    const fieldIds = new Set(entity.fields.map((f) => f.id));
    r.assertions.forEach((assertion, j) => {
      if (!fieldIds.has(assertion.fieldId)) {
        push(
          "AIR_RULE_FIELD_UNKNOWN",
          `rules[${i}].assertions[${j}].fieldId`,
          `champ "${assertion.fieldId}" absent de l'entité "${r.entityId}"`,
        );
      }
    });
  });

  // 9. Permissions et intégrations : capabilities déclarées uniquement.
  air.permissions.forEach((p, i) => {
    if (!declaredCapabilities.has(p.requiredByCapability)) {
      push(
        "AIR_PERMISSION_CAPABILITY_UNDECLARED",
        `permissions[${i}].requiredByCapability`,
        `capability "${p.requiredByCapability}" non déclarée`,
      );
    }
  });
  air.integrations.forEach((x, i) => {
    if (x.capability !== undefined && !declaredCapabilities.has(x.capability)) {
      push(
        "AIR_INTEGRATION_CAPABILITY_UNDECLARED",
        `integrations[${i}].capability`,
        `capability "${x.capability}" non déclarée`,
      );
    }
    if (x.config !== undefined) {
      x.config.forEach((pair, j) => {
        if (SECRET_LIKE_KEY.test(pair.key)) {
          push(
            "AIR_INTEGRATION_SECRET_LIKE_KEY",
            `integrations[${i}].config[${j}]`,
            `clé "${pair.key}" à l'allure de secret — les secrets ne vivent JAMAIS dans l'AIR`,
          );
        }
      });
    }
  });

  // 10. Classe commerce (§2) : biens digitaux ⇒ IAP obligatoire — un PSP
  // déclaré dans les intégrations est un refus store garanti (4.2.6/3.1.1).
  if (air.compliance.commerceClass === "digital") {
    air.integrations.forEach((x, i) => {
      if (x.providerClass === "psp") {
        push(
          "AIR_COMMERCE_DIGITAL_PSP_FORBIDDEN",
          `integrations[${i}].providerClass`,
          "classe commerce digital : le paiement passe par IAP, pas par un PSP",
        );
      }
    });
  }

  // 11. Tests attendus : la cible est un écran, une action ou une entité.
  const testTargets = new Set<string>([
    ...screenIds,
    ...air.actions.map((a) => a.id),
    ...entityById.keys(),
  ]);
  air.expectedTests.forEach((t, i) => {
    if (!testTargets.has(t.targetId)) {
      push(
        "AIR_TEST_TARGET_UNKNOWN",
        `expectedTests[${i}].targetId`,
        `cible "${t.targetId}" introuvable (écran, action ou entité)`,
      );
    }
  });

  // Sortie triée (path, code) : même AIR ⇒ même liste, octet pour octet.
  return diagnostics.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0,
  );
}

export class AirSemanticError extends Error {
  readonly diagnostics: AirDiagnostic[];

  constructor(diagnostics: AirDiagnostic[]) {
    super(`AIR sémantiquement invalide : ${String(diagnostics.length)} diagnostic(s)`);
    this.name = "AirSemanticError";
    this.diagnostics = diagnostics;
  }
}

// Point d'entrée fail-closed : schéma PUIS sémantique — un AIR qui ne passe
// pas les deux n'existe pas pour le reste du pipeline.
export function assertValidAir(input: unknown): ProjectAir {
  const air = projectAirSchema.parse(input);
  const diagnostics = validateAir(air);
  if (diagnostics.length > 0) {
    throw new AirSemanticError(diagnostics);
  }
  return air;
}
