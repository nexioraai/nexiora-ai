// BANC E2E — FLOW DE RÉFÉRENCE (Detox). Sémantique STRICTEMENT identique au
// flow Maestro : mêmes étapes, mêmes assertions, même point de
// synchronisation initial (fin du scénario auto de la fixture P-003).
const { device, element, by, waitFor } = require("detox");

describe("flow-reference", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("navigation + formulaire + états error", async () => {
    // 1. synchronisation : le scénario auto de la fixture est terminé
    await waitFor(element(by.id("bench-result"))).toBeVisible().withTimeout(60000);
    // 2. navigation vers le formulaire
    await element(by.id("nav-form")).tap();
    // 3. assertions d'état error (2 champs en erreur dans la fixture)
    await waitFor(element(by.text("Format invalide"))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.text("IBAN inconnu"))).toBeVisible().withTimeout(10000);
    // 4. le bouton de soumission est présent
    await waitFor(element(by.id("form-submit"))).toBeVisible().withTimeout(10000);
    // 5. navigation vers l'écran thème + bascule
    await element(by.id("nav-theme")).tap();
    await waitFor(element(by.id("toggle-theme"))).toBeVisible().withTimeout(10000);
    await element(by.id("toggle-theme")).tap();
    await waitFor(element(by.id("toggle-rtl"))).toBeVisible().withTimeout(10000);
    // 6. retour à la liste
    await element(by.id("nav-list")).tap();
    await waitFor(element(by.id("bench-list"))).toBeVisible().withTimeout(10000);
  });
});
