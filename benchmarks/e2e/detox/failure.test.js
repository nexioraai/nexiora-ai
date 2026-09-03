// SONDE DE DIAGNOSTIC D'ÉCHEC (Detox) — assertion volontairement fausse.
const { device, element, by, waitFor } = require("detox");
describe("sonde-echec", () => {
  beforeAll(async () => { await device.launchApp({ newInstance: true }); });
  it("assertion volontairement fausse", async () => {
    await waitFor(element(by.id("element-inexistant"))).toBeVisible().withTimeout(8000);
  });
});
