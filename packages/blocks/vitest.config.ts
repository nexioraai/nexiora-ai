import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
  },
  resolve: {
    // Les paquets workspace liés (primitives) ne doivent JAMAIS charger leur
    // propre copie de react — une seule instance pour les hooks.
    dedupe: ["react", "react-test-renderer"],
    alias: {
      // E1 (dossier 3.2 validé) : les tests structurels s'exécutent en node
      // avec un STUB de react-native (composants hôtes purs pour
      // react-test-renderer). Le typage, lui, se fait contre les VRAIS types
      // RN (devDependency) ; la vérité de rendu natif est le harnais 3.4.
      "react-native": fileURLToPath(
        new URL("./tests/stubs/react-native.ts", import.meta.url),
      ),
    },
  },
});
