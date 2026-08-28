// Générateur TRIVIAL du flow de navigation depuis une structure de type AIR → Maestro.
import { readFileSync, writeFileSync } from "node:fs";
const air = JSON.parse(readFileSync("air-min.json", "utf8"));
const steps = air.navigation.routes.flatMap((r) => [
  `- tapOn:\n    id: "${r.testID}"`,
  `- extendedWaitUntil:\n    visible:\n      id: "${r.anchor}"\n    timeout: 10000`,
]);
writeFileSync("out-nav.yaml", `appId: \${APP_ID}\n---\n- launchApp\n${steps.join("\n")}\n`);
