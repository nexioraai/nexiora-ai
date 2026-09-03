// Lint BLOQUANT dès le premier commit (règle packages/README.md).
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "coverage/**", "corpus/**"] },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
