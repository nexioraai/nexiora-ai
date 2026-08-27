// BANC P-001 -- candidat (c) Trigger.dev : configuration du projet de banc.
// Le projet cible est lu depuis l'environnement (jamais ecrit en dur) ;
// DATABASE_URL (base de test jetable) est synchronisee vers l'environnement
// cloud au deploiement -- la valeur ne transite que vers Trigger.dev, jamais
// dans le depot.
import { defineConfig } from "@trigger.dev/sdk/v3";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  dirs: ["./src/trigger"],
  maxDuration: 600,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 1 },
  },
  build: {
    extensions: [
      syncEnvVars(async () => [
        { name: "DATABASE_URL", value: process.env.DATABASE_URL! },
      ]),
    ],
  },
});
