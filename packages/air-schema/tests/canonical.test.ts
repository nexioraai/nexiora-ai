import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonical, sha256Hex } from "../src";

describe("canonicalJson / hashCanonical", () => {
  it("produit le même hash quel que soit l'ordre d'insertion des clés", () => {
    const a = { name: "x", nested: { b: 2, a: 1 }, list: [{ z: 1, a: 2 }] };
    const b = { list: [{ a: 2, z: 1 }], nested: { a: 1, b: 2 }, name: "x" };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(hashCanonical(a)).toBe(hashCanonical(b));
  });

  it("préserve l'ordre des tableaux (significatif dans l'AIR)", () => {
    expect(hashCanonical({ items: [1, 2] })).not.toBe(hashCanonical({ items: [2, 1] }));
  });

  it("distingue deux contenus différents", () => {
    expect(hashCanonical({ a: 1 })).not.toBe(hashCanonical({ a: 2 }));
  });

  it("émet un hash SHA-256 hexadécimal de 64 caractères", () => {
    expect(sha256Hex("deribfy")).toMatch(/^[0-9a-f]{64}$/);
  });
});
