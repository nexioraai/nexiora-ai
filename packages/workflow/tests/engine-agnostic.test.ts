// CLIQUET ENGINE-AGNOSTIC (D-035, même discipline que D-033) : le cœur
// n'importe aucun SDK d'orchestrateur et ne nomme aucun moteur dans un
// type exporté — remplacer Trigger.dev demain ne touche pas le cœur.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const FORBIDDEN = ['from "@trigger.dev', 'from "inngest"', 'from "pg"', 'from "modal"', 'from "e2b"'];

describe("cliquet engine-agnostic (cœur workflow)", () => {
  it("aucun SDK d'orchestrateur ni de provider dans src/", () => {
    for (const f of readdirSync(SRC).filter((x) => x.endsWith(".ts"))) {
      const c = readFileSync(join(SRC, f), "utf8");
      for (const bad of FORBIDDEN) expect(c.includes(bad), `${f} → ${bad}`).toBe(false);
    }
  });
  it("aucun type exporté ne nomme un moteur", () => {
    const c = readFileSync(join(SRC, "state-machine.ts"), "utf8");
    for (const m of c.matchAll(/export (?:interface|type|class|function|const) (\w+)/g)) {
      expect(/trigger|inngest|pgmq|temporal/i.test(m[1] ?? ""), m[1]).toBe(false);
    }
  });
});
