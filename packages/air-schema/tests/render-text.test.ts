import { describe, expect, it } from "vitest";
import { renderAirToText } from "../src";
import { buildValidAir } from "./fixtures";

describe("renderAirToText", () => {
  it("est déterministe : deux rendus du même AIR sont identiques", () => {
    const air = buildValidAir();
    expect(renderAirToText(air)).toBe(renderAirToText(buildValidAir()));
  });

  it("est sans perte sur les identités : chaque id du document apparaît dans le texte", () => {
    const air = buildValidAir();
    const text = renderAirToText(air);
    const ids = [
      air.projectId,
      ...air.screens.map((s) => s.id),
      ...air.screens.flatMap((s) => s.blocks.map((b) => b.id)),
      ...air.navigation.routes.map((r) => r.id),
      ...air.entities.map((e) => e.id),
      ...air.entities.flatMap((e) => e.fields.map((f) => f.id)),
      ...air.relations.map((r) => r.id),
      ...air.datasets.map((d) => d.id),
      ...air.actions.map((a) => a.id),
      ...air.rules.map((r) => r.id),
      ...air.slots.map((s) => s.id),
      ...air.integrations.map((x) => x.id),
      ...air.expectedTests.map((t) => t.id),
    ];
    for (const id of ids) {
      expect(text, id).toContain(`\`${id}\``);
    }
  });

  it("rend les valeurs structurées en JSON canonique (ordre de clés stable)", () => {
    const text = renderAirToText(buildValidAir());
    expect(text).toContain('[{"locale":"fr","text":"Menu"},{"locale":"en","text":"Menu"}]');
    expect(text).toContain('[{"key":"pageSize","value":20}]');
    expect(text).toContain('["api.example.com"]');
  });

  it("couvre chaque section du schéma", () => {
    const text = renderAirToText(buildValidAir());
    for (const section of [
      "## Application",
      "## Écrans",
      "## Navigation",
      "## Entités",
      "## Relations",
      "## Jeux de données initiaux",
      "## Actions",
      "## Règles métier",
      "## Code Slots",
      "## Capabilities",
      "## Permissions",
      "## Design",
      "## Intégrations",
      "## Réseau",
      "## Exigences natives",
      "## Conformité",
      "## Tests attendus",
    ]) {
      expect(text).toContain(section);
    }
  });
});
