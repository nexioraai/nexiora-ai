import type { ProjectAir } from "./air.ts";
import { AIR_SCHEMA_VERSION } from "./air.ts";
import { canonicalJson } from "./canonical.ts";

// Rendu texte DÉTERMINISTE et SANS PERTE d'un AIR (ROADMAP Phase 2 :
// round-trip intention → AIR → rendu texte → même AIR). Chaque champ du
// document apparaît dans le texte avec sa valeur exacte — un émetteur qui
// transcrit fidèlement ce texte doit reproduire un AIR canoniquement
// identique. Les valeurs libres (textes localisés, configurations) sont
// rendues en JSON canonique pour lever toute ambiguïté.
const json = (value: unknown): string => canonicalJson(value);

function optional(label: string, value: unknown): string {
  return value === undefined ? "" : ` · ${label} ${json(value)}`;
}

export function renderAirToText(air: ProjectAir): string {
  const lines: string[] = [];
  const push = (line: string): void => {
    lines.push(line);
  };

  push(`# SPÉCIFICATION D'APPLICATION MOBILE — AIR v${AIR_SCHEMA_VERSION}`);
  push(`- projectId: \`${air.projectId}\``);

  push(`## Application`);
  push(`- nom: ${json(air.app.name)} · slug: \`${air.app.slug}\`${optional("description:", air.app.description)}`);
  const l = air.app.locales;
  push(
    `- locales: langue utilisateur \`${l.userLanguage}\` · locales app ${json(l.appLocales)} · locale par défaut \`${l.defaultAppLocale}\` · locales contenu ${json(l.contentLocales)} · RTL ${l.rtlSupported ? "oui" : "non"}`,
  );

  push(`## Écrans (${air.screens.length})`);
  for (const screen of air.screens) {
    push(`### Écran \`${screen.id}\` — titre ${json(screen.title)}`);
    screen.blocks.forEach((block, i) => {
      push(
        `- bloc ${i + 1}: \`${block.id}\` · type \`${block.blockType}\`${block.entityId === undefined ? "" : ` · entité \`${block.entityId}\``}${optional("props:", block.props)}`,
      );
    });
  }

  push(`## Navigation`);
  push(`- écran d'entrée: \`${air.navigation.entryScreenId}\``);
  air.navigation.routes.forEach((route, i) => {
    push(
      `- route ${i + 1}: \`${route.id}\` → \`${route.screenId}\`${optional("titre:", route.title)}`,
    );
  });

  push(`## Entités (${air.entities.length})`);
  for (const entity of air.entities) {
    push(`### Entité \`${entity.id}\` — nom \`${entity.name}\``);
    entity.fields.forEach((field, i) => {
      push(
        `- champ ${i + 1}: \`${field.id}\` · nom \`${field.name}\` · type \`${field.type}\` · requis ${field.required ? "oui" : "non"}${field.unique === undefined ? "" : ` · unique ${field.unique ? "oui" : "non"}`}${optional("valeurs enum:", field.enumValues)}${field.referencesEntityId === undefined ? "" : ` · référence \`${field.referencesEntityId}\``}`,
      );
    });
  }

  push(`## Relations (${air.relations.length})`);
  air.relations.forEach((relation, i) => {
    push(
      `- relation ${i + 1}: \`${relation.id}\` · \`${relation.fromEntityId}\` → \`${relation.toEntityId}\` · type \`${relation.kind}\``,
    );
  });

  push(`## Jeux de données initiaux (${air.datasets.length})`);
  air.datasets.forEach((dataset, i) => {
    push(
      `- dataset ${i + 1}: \`${dataset.id}\` · entité \`${dataset.entityId}\` · hash \`${dataset.contentHash}\` · lignes ${dataset.rowCount}`,
    );
  });

  push(`## Actions (${air.actions.length})`);
  for (const action of air.actions) {
    push(
      `- action \`${action.id}\` · nom ${json(action.name)} · déclencheur ${json(action.trigger)} · effet ${json(action.effect)}`,
    );
  }

  push(`## Règles métier (${air.rules.length})`);
  for (const rule of air.rules) {
    push(
      `- règle \`${rule.id}\` · ${json(rule.description)} · type \`${rule.kind}\` · entité \`${rule.entityId}\` · assertions ${json(rule.assertions)}`,
    );
  }

  push(`## Code Slots (${air.slots.length})`);
  for (const slot of air.slots) {
    push(
      `- slot \`${slot.id}\` · ${json(slot.description)} · entrées ${json(slot.inputs)} · sorties ${json(slot.outputs)} · imports autorisés ${json(slot.allowedImports)}`,
    );
  }

  push(`## Capabilities (${air.capabilities.length})`);
  for (const capability of air.capabilities) {
    push(`- capability \`${capability.capability}\`${optional("config:", capability.config)}`);
  }

  push(`## Permissions (${air.permissions.length})`);
  for (const permission of air.permissions) {
    push(
      `- permission \`${permission.permission}\` · plateforme \`${permission.platform}\` · justification ${json(permission.reason)} · exigée par \`${permission.requiredByCapability}\``,
    );
  }

  push(`## Design`);
  push(
    `- thème \`${air.design.theme}\`${air.design.tokensVersion === undefined ? "" : ` · version tokens \`${air.design.tokensVersion}\``}${optional("overrides:", air.design.overrides)}`,
  );

  push(`## Intégrations (${air.integrations.length})`);
  for (const integration of air.integrations) {
    push(
      `- intégration \`${integration.id}\` · classe provider \`${integration.providerClass}\`${integration.capability === undefined ? "" : ` · capability \`${integration.capability}\``}${optional("config:", integration.config)}`,
    );
  }

  push(`## Réseau`);
  push(
    `- politique \`${air.network.policy}\` · domaines autorisés ${json(air.network.allowedDomains)}`,
  );

  push(`## Exigences natives`);
  push(
    `- iOS minimum \`${air.native.minIosVersion}\` · Android SDK minimum ${air.native.minAndroidSdk}`,
  );

  push(`## Conformité`);
  push(
    `- classe commerce \`${air.compliance.commerceClass}\` · suppression de compte requise ${air.compliance.accountDeletionRequired ? "oui" : "non"} · données collectées ${json(air.compliance.dataCollected)}`,
  );

  push(`## Tests attendus (${air.expectedTests.length})`);
  for (const test of air.expectedTests) {
    push(
      `- test \`${test.id}\` · ${json(test.description)} · type \`${test.kind}\` · cible \`${test.targetId}\``,
    );
  }

  return lines.join("\n");
}
