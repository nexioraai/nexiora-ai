// ADAPTATEUR Trigger.dev (7.2, D-035/D-016) — configuration du projet.
// Le projet cible vient de l'environnement (jamais en dur). Les
// credentials des étapes externes (Modal, §8) sont synchronisés vers
// l'environnement CHIFFRÉ de Trigger.dev au déploiement — jamais dans le
// dépôt, jamais journalisés (lecture consignée D-035).
import { defineConfig } from "@trigger.dev/sdk/v3";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  dirs: ["./src/trigger"],
  maxDuration: 900,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
  build: {
    extensions: [
      syncEnvVars(async () => [
        { name: "MODAL_TOKEN_ID", value: process.env.MODAL_TOKEN_ID! },
        { name: "MODAL_TOKEN_SECRET", value: process.env.MODAL_TOKEN_SECRET! },
      ]),
    ],
  },
});
