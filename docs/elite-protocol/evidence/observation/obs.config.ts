import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const ici = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const REACT = ici("../../../../packages/blocks/node_modules/react");
export default defineConfig({
  test: { include: ["**/*.obs.tsx"], environment: "node", root: ici(".") },
  resolve: {
    dedupe: ["react", "react-test-renderer"],
    alias: [
      // Stubs d'HÔTE : ce sont eux qui rendent l'exécution OBSERVABLE en node.
      { find: "react-native-safe-area-context", replacement: ici("./stub-safe-area.ts") },
      { find: "@react-navigation/native", replacement: ici("./stub-navigation.ts") },
      { find: "react-native", replacement: ici("./stub-rn.ts") },
      // Une SEULE instance de react, partagée par le rendu et les composants émis.
      { find: "react-test-renderer", replacement: ici("../../../../packages/blocks/node_modules/react-test-renderer") },
      { find: /^react\/(.*)$/, replacement: REACT + "/$1" },
      { find: /^react$/, replacement: REACT },
    ],
  },
});
