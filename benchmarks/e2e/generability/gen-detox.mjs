// Générateur TRIVIAL du flow de navigation depuis une structure de type AIR → Detox.
import { readFileSync, writeFileSync } from "node:fs";
const air = JSON.parse(readFileSync("air-min.json", "utf8"));
const steps = air.navigation.routes.flatMap((r) => [
  `    await element(by.id("${r.testID}")).tap();`,
  `    await waitFor(element(by.id("${r.anchor}"))).toBeVisible().withTimeout(10000);`,
]);
writeFileSync("out-nav.test.js", `const { device, element, by, waitFor } = require("detox");\ndescribe("nav", () => {\n  beforeAll(async () => { await device.launchApp({ newInstance: true }); });\n  it("navigation generee", async () => {\n${steps.join("\n")}\n  });\n});\n`);
