const { device, element, by, waitFor } = require("detox");
describe("nav", () => {
  beforeAll(async () => { await device.launchApp({ newInstance: true }); });
  it("navigation generee", async () => {
    await element(by.id("nav-list")).tap();
    await waitFor(element(by.id("bench-list"))).toBeVisible().withTimeout(10000);
    await element(by.id("nav-form")).tap();
    await waitFor(element(by.id("form-submit"))).toBeVisible().withTimeout(10000);
    await element(by.id("nav-theme")).tap();
    await waitFor(element(by.id("toggle-theme"))).toBeVisible().withTimeout(10000);
  });
});
