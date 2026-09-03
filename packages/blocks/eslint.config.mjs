// Lint BLOQUANT dès le premier commit (règle packages/README.md) : la dette
// lint de apps/web ne s'hérite pas — ce paquet démarre à zéro écart et y reste.
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "coverage/**"] },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Les chemins de diagnostics interpolent des index numériques
      // (`screens[${i}]`) : usage sûr et voulu (même règle qu'air-schema).
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  {
    // Choix E1 ASSUMÉ (dossier 3.2 validé par le propriétaire) :
    // react-test-renderer est déprécié par React 19 mais reste le seul rendu
    // d'arbre léger en node sans introduire un second runner (jest + preset
    // RN). Exception CONSCIENTE, limitée aux tests — la vérité de rendu est
    // le harnais 3.4 sur device/émulateur. À réexaminer si l'outillage RN
    // de test sous vitest mûrit.
    files: ["tests/**"],
    rules: { "@typescript-eslint/no-deprecated": "off" },
  },
  {
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
