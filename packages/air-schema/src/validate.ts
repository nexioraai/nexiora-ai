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

// ══════════════════════════════════════════════════════════════════════════
// D-088 · D4 — L'INTENTION EST DUE À PARTIR DU CONTRAT QUI L'A CRÉÉE.
//
// `intent` est OPTIONNEL dans le schéma, et doit le rester : un document
// 1.0.0 ou 1.1.0 n'en portait aucune, et la migration 1.1.0 → 1.2.0 est une
// IDENTITÉ délibérée — inventer une demande fabriquerait précisément la seule
// chose que ce champ existe pour ne plus perdre. Un document historique reste
// donc VALIDE sous son propre contrat.
//
// Mais l'absence d'intention est aussi l'échappatoire la plus large qui soit :
// un document sans `intent` n'a AUCUN besoin à perdre, donc aucune couverture
// à démontrer. Mesuré : 12 documents sur 24 n'en portent aucune.
//
// La règle porte donc sur la version DÉCLARÉE, lue sur le document BRUT —
// avant migration, puisque la migration porte tout à la version courante et
// effacerait la seule information qui distingue un artefact gelé d'un document
// neuf. À partir de 1.2.0, le contrat prévoyait l'intention : elle est due.
const VERSION_INTENTION_DUE = [1, 2, 0] as const;

const compareVersions = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/**
 * Refuse un document qui, sous un contrat prévoyant `intent`, n'en porte pas.
 * Prend le document BRUT (non migré, non parsé) : la version déclarée est la
 * seule preuve de provenance disponible.
 */
export function validateAirIntentRequirement(raw: unknown): AirDiagnostic[] {
  if (typeof raw !== "object" || raw === null) return [];
  const doc = raw as { airSchemaVersion?: unknown; intent?: unknown };
  const version = typeof doc.airSchemaVersion === "string" ? doc.airSchemaVersion : undefined;
  if (version === undefined) return [];
  const parts = version.split(".").map((n) => Number.parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return [];
  if (compareVersions(parts, VERSION_INTENTION_DUE) < 0) return [];
  if (doc.intent !== undefined) return [];
  return [
    {
      code: "AIR_INTENT_REQUISE",
      path: "intent",
      message:
        `le document déclare la version ${version}, qui prévoit \`intent\` : la demande du ` +
        "client et les besoins qu'elle exprime sont DUS. Un document sans intention n'a aucun " +
        "besoin à perdre, donc aucune fidélité à démontrer",
    },
  ];
}

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
  air.intent?.needs.forEach((n, i) => {
    identities.push([n.id, `intent.needs[${i}]`]);
  });

  // NAVIGATION PRINCIPALE (1.6.0, D-086) — quatre refus, chacun mesurable.
  //
  // Le quatrième est le plus important : une destination qui mène à un écran
  // NON FONCTIONNEL produirait une barre magnifique menant à du vide. **Une
  // navigation qui mène à du vide est pire que quatre boutons empilés : elle est
  // belle.** Un écran est tenu pour fonctionnel s'il porte au moins un bloc lié
  // à une entité, ou au moins une action. Un écran qui n'a ni l'un ni l'autre
  // n'a rien à montrer et rien à faire.
  if (air.navigation.primary !== undefined) {
    const routeById = new Map(air.navigation.routes.map((r) => [r.id, r]));
    const blocsDeLEcran = new Map(air.screens.map((s) => [s.id, s]));
    const actionsParEcran = new Set<string>();
    for (const a of air.actions) {
      const t = a.trigger;
      if (t.kind === "ui") {
        const e = air.screens.find((s) => s.blocks.some((b) => b.id === t.blockId));
        if (e !== undefined) actionsParEcran.add(e.id);
      } else if (t.kind === "lifecycle" && t.screenId !== undefined) {
        actionsParEcran.add(t.screenId);
      }
    }
    const ordres = new Set<number>();
    air.navigation.primary.destinations.forEach((d, i) => {
      const path = `navigation.primary.destinations[${i}]`;
      const route = routeById.get(d.routeId);
      if (route === undefined) {
        push("AIR_NAV_ROUTE_MISSING", path, `route "${d.routeId}" non déclarée`);
        return;
      }
      if (ordres.has(d.order)) {
        push("AIR_NAV_ORDER_DUPLICATE", path, `ordre ${String(d.order)} déjà utilisé`);
      }
      ordres.add(d.order);
      const ecran = blocsDeLEcran.get(route.screenId);
      if (ecran === undefined) {
        push("AIR_NAV_SCREEN_MISSING", path, `écran "${route.screenId}" non déclaré`);
        return;
      }
      const aDesDonnees = ecran.blocks.some((b) => b.entityId !== undefined);
      const aUneAction = actionsParEcran.has(ecran.id);
      if (!aDesDonnees && !aUneAction) {
        push(
          "AIR_NAV_DESTINATION_DEAD",
          path,
          `l'écran "${ecran.id}" n'a ni bloc lié à une entité ni action : une destination principale ne peut pas mener à un écran vide`,
        );
      }
    });
    // DOUBLON D'ONGLET (D-086) — un bouton placé SUR un onglet et menant à un
    // AUTRE onglet est une redondance pure : la barre est déjà là, sous le
    // doigt. C'est le défaut fondateur — quatre boutons sous la liste des plats,
    // vers panier / commandes / compte, tous présents dans la barre.
    //
    // 🔴 CRITÈRE PRÉCIS, et voici pourquoi il l'est : un bouton depuis un écran
    // de FLUX (un détail, une étape) vers un onglet n'est PAS un doublon, c'est
    // un appel à l'action qui fait avancer l'utilisateur — « Débloquer avec
    // l'abonnement » depuis la fiche d'un programme verrouillé. Le confondre
    // avec le défaut reviendrait à interdire toute conversion.
    const ecranDest = new Set<string>();
    for (const d of air.navigation.primary.destinations) {
      const r = routeById.get(d.routeId);
      if (r !== undefined) ecranDest.add(r.screenId);
    }
    air.actions.forEach((action, i) => {
      if (action.effect.kind !== "navigate" || action.trigger.kind !== "ui") return;
      const bloc = action.trigger.blockId;
      const source = air.screens.find((s) => s.blocks.some((b) => b.id === bloc));
      if (source === undefined) return;
      const type = source.blocks.find((b) => b.id === bloc)?.blockType;
      if (type !== "button") return;
      if (!ecranDest.has(source.id)) return;
      if (!ecranDest.has(action.effect.screenId)) return;
      push(
        "AIR_NAV_TAB_DUPLICATE",
        `actions[${i}]`,
        `bouton sur l'onglet "${source.id}" menant à l'onglet "${action.effect.screenId}" : la navigation principale l'offre déjà`,
      );
    });

    // IMAGE ORPHELINE (D-087) — une image déclarée sur une entité AFFICHÉE et
    // jamais montrée est un défaut. Mesuré : 23 champs sur 12 documents rendus
    // nulle part, puis 3 encore orphelins APRÈS une première version de la
    // règle de prompt : le mot « pertinent » y servait de porte de sortie.
    //
    // 🔴 POURQUOI ICI ET PAS SEULEMENT DANS LE PROMPT : un prompt est une
    // DEMANDE, un validateur est une GARANTIE. `emit-v3` valide localement et
    // renvoie ses diagnostics au modèle pour réparation (`attempts=2`, observé
    // sur les deux générations). Porté ici, le respect cesse de dépendre du
    // bon vouloir d'un modèle.
    //
    // PORTÉE ASSUMÉE : ce refus ne s'applique qu'aux documents déclarant
    // `navigation.primary`. Le corpus GELÉ n'en déclare aucun (0/12, vérifié)
    // et reste donc valide — le geler puis le rendre invalide détruirait la
    // base de comparaison de toutes les mesures historiques.
    const entiteAffichee = new Map<string, boolean>();
    for (const s of air.screens) {
      for (const b of s.blocks) {
        if (b.entityId !== undefined) entiteAffichee.set(b.entityId, true);
      }
    }
    const imagesMontrees = new Set<string>();
    for (const s of air.screens) {
      for (const b of s.blocks) {
        for (const pr of b.props ?? []) {
          if (pr.key === "imageFieldId") imagesMontrees.add(String(pr.value));
        }
      }
    }
    // ── D-098 · LE CHEMIN DIT OÙ EST LA RÉPARATION LÉGITIME.
    //
    // Ce diagnostic offrait DEUX issues : afficher, ou ne pas déclarer. Le
    // garde de réparation déduit son périmètre du CHEMIN (D-093) ; en pointant
    // le champ, il autorisait donc la SUPPRESSION — même quand un bloc capable
    // de l'afficher existait. Mesuré sur `coach-fitness` : `fld_prog_couverture`
    // a deux porteurs possibles, et le supprimer restait indolore.
    //
    // Quand un PORTEUR existe — un `list` ou un `detail_header` lié à cette
    // entité — la réparation légitime est l'AFFICHAGE, et le chemin désigne ce
    // bloc : supprimer le champ sort alors du périmètre. Sans porteur, le champ
    // reste désigné et sa suppression demeure permise. La distinction est une
    // propriété DÉCIDABLE du document, jamais un cas particulier.
    const PORTEURS_IMAGE = new Set(["list", "detail_header"]);
    const porteurDe = new Map<string, string>();
    air.screens.forEach((s, si) => {
      s.blocks.forEach((b, bi) => {
        if (b.entityId === undefined || !PORTEURS_IMAGE.has(b.blockType)) return;
        if (!porteurDe.has(b.entityId)) porteurDe.set(b.entityId, `screens[${si}].blocks[${bi}]`);
      });
    });
    air.entities.forEach((e, i) => {
      if (entiteAffichee.get(e.id) !== true) return;
      e.fields.forEach((f, j) => {
        if (f.type !== "asset" || imagesMontrees.has(f.id)) return;
        const porteur = porteurDe.get(e.id);
        if (porteur !== undefined) {
          push(
            "AIR_IMAGE_ORPHELINE",
            porteur,
            `"${f.id}" est déclaré sur l'entité affichée "${e.id}" et n'est montré par aucun bloc : ce bloc peut le porter, déclare-le sur son \`imageFieldId\``,
          );
          return;
        }
        push(
          "AIR_IMAGE_ORPHELINE",
          `entities[${i}].fields[${j}]`,
          `"${f.id}" est déclaré sur l'entité affichée "${e.id}" et aucun bloc \`list\` ou \`detail_header\` ne peut l'afficher : déclare un tel bloc, ou ne déclare pas ce champ`,
        );
      });
    });

    // Ordres CONTIGUS depuis 0 : un trou signifierait une position vide dans la
    // barre, que le runtime devrait combler en inventant.
    const attendus = [...air.navigation.primary.destinations.keys()];
    if ([...ordres].sort((a, b) => a - b).join(",") !== attendus.join(",")) {
      push(
        "AIR_NAV_ORDER_NOT_CONTIGUOUS",
        "navigation.primary",
        `les ordres doivent être contigus depuis 0 (reçu : ${[...ordres].sort((a, b) => a - b).join(", ")})`,
      );
    }
  }

  // AFFICHAGE DES RÉFÉRENCES (1.4.0) — le champ désigné doit exister SUR
  // L'ENTITÉ CIBLE, sinon la traversée afficherait du vide en croyant résoudre.
  air.entities.forEach((entity, i) => {
    entity.fields.forEach((field, j) => {
      if (field.referenceDisplayFieldId === undefined) return;
      const path = `entities[${i}].fields[${j}].referenceDisplayFieldId`;
      if (field.type !== "reference" || field.referencesEntityId === undefined) {
        push("AIR_FIELD_DISPLAY_NOT_REFERENCE", path, `champ "${field.id}" n'est pas une référence`);
        return;
      }
      const cible = entityById.get(field.referencesEntityId);
      if (cible === undefined) return;
      if (!cible.fields.some((f) => f.id === field.referenceDisplayFieldId)) {
        push(
          "AIR_FIELD_DISPLAY_MISSING",
          path,
          `"${field.referenceDisplayFieldId}" absent de l'entité "${cible.id}"`,
        );
      }
    });
  });

  // LIAISON DES SLOTS (1.3.0) — une liaison partielle est REFUSÉE. Un port
  // d'entrée non lié produirait un `undefined` silencieux dans du code
  // d'auteur ; un port inconnu ferait croire à un câblage qui n'existe pas.
  const slotById = new Map(air.slots.map((s) => [s.id, s]));
  air.actions.forEach((action, i) => {
    if (action.effect.kind !== "slot" || action.effect.binding === undefined) return;
    const path = `actions[${i}].effect.binding`;
    const slot = slotById.get(action.effect.slotId);
    if (slot === undefined) {
      push("AIR_SLOT_UNKNOWN", path, `slot "${action.effect.slotId}" non déclaré`);
      return;
    }
    const { inputs, outputs } = action.effect.binding;
    const liees = new Set(inputs.map((b) => b.port));
    for (const port of slot.inputs) {
      if (!liees.has(port.name)) {
        push("AIR_SLOT_INPUT_UNBOUND", path, `entrée "${port.name}" du slot "${slot.id}" non liée`);
      }
    }
    const attendus = new Set(slot.inputs.map((p) => p.name));
    inputs.forEach((b, j) => {
      if (!attendus.has(b.port)) {
        push("AIR_SLOT_INPUT_UNKNOWN", `${path}.inputs[${j}]`, `le slot "${slot.id}" ne déclare aucune entrée "${b.port}"`);
      }
      if (b.source.kind === "entity_rows" && !entityById.has(b.source.entityId)) {
        push("AIR_REF_ENTITY_MISSING", `${path}.inputs[${j}]`, `entité "${b.source.entityId}" inconnue`);
      }
    });
    const sorties = new Set(slot.outputs.map((p) => p.name));
    outputs.forEach((b, j) => {
      if (!sorties.has(b.port)) {
        push("AIR_SLOT_OUTPUT_UNKNOWN", `${path}.outputs[${j}]`, `le slot "${slot.id}" ne déclare aucune sortie "${b.port}"`);
      }
      if (!blockIds.has(b.blockId)) {
        push("AIR_REF_BLOCK_MISSING", `${path}.outputs[${j}]`, `bloc "${b.blockId}" inconnu`);
      }
    });
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

  // 7bis. Condition de visibilité (1.1.0) : l'entité visée DOIT exister.
  //       Sans ce contrôle, un bloc pourrait être conditionné sur une entité
  //       fantôme et disparaître silencieusement de l'app.
  air.screens.forEach((screen, si) => {
    screen.blocks.forEach((block, bi) => {
      const condition = block.visibleWhen;
      if (condition === undefined) return;
      if (!entityById.has(condition.entityId)) {
        push(
          "AIR_BLOCK_VISIBILITY_ENTITY_UNKNOWN",
          `screens[${si}].blocks[${bi}].visibleWhen.entityId`,
          `entité "${condition.entityId}" introuvable`,
        );
      }
    });
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
