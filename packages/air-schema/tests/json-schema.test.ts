import { describe, expect, it } from "vitest";
import {
  deploymentStateJsonSchema,
  projectAirJsonSchema,
  projectLockJsonSchema,
} from "../src";

describe("projection JSON Schema (structured outputs)", () => {
  it("projette l'AIR en objet strict (additionalProperties: false)", () => {
    const schema = projectAirJsonSchema();
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const properties = schema.properties as Record<string, unknown>;
    expect(Object.keys(properties)).toContain("airSchemaVersion");
    expect(Object.keys(properties)).toContain("screens");
    expect(Object.keys(properties)).toContain("capabilities");
  });

  it("exige toutes les sections de l'AIR (required complet)", () => {
    const schema = projectAirJsonSchema();
    const required = schema.required as string[];
    for (const section of [
      "app",
      "navigation",
      "entities",
      "actions",
      "network",
      "compliance",
    ]) {
      expect(required).toContain(section);
    }
  });

  it("projette lock et deployment state sans récursion non sérialisable", () => {
    expect(() => JSON.stringify(projectLockJsonSchema())).not.toThrow();
    expect(() => JSON.stringify(deploymentStateJsonSchema())).not.toThrow();
  });

  it("reste stable entre deux projections (déterminisme)", () => {
    expect(JSON.stringify(projectAirJsonSchema())).toBe(
      JSON.stringify(projectAirJsonSchema()),
    );
  });
});
