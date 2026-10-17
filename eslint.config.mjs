// ESLint 9 flat config tanpa eslint-config-next: paket itu menarik fast-glob → micromatch → braces
// (GHSA-vfj7-8cjw-p6xm, tanpa perbaikan upstream) dan menggagalkan gate audit. Aturan Next yang
// hilang (no-img-element, no-html-link-for-pages) tidak relevan untuk App Router + next/image.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

const AG_ENTERPRISE =
  "AG Grid Enterprise butuh lisensi berbayar; pakai modul ag-grid-community (ADR-0007).";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      ".cache/**",
      "next-env.d.ts",
      ".claude/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs["recommended-latest"].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "react/prop-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // ADR-0007 (T-035): grid "Lihat data" memakai AG Grid Community (MIT) saja; modul Enterprise (grid
    // maupun AG Charts) butuh lisensi berbayar. import()/require() — termasuk dengan template literal —
    // tidak dicakup no-restricted-imports, jadi ditangkap lewat no-restricted-syntax.
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "ag-grid-enterprise", message: AG_ENTERPRISE },
            { name: "ag-grid-charts-enterprise", message: AG_ENTERPRISE },
            { name: "ag-charts-enterprise", message: AG_ENTERPRISE },
          ],
          patterns: [
            {
              group: [
                "ag-grid-enterprise/*",
                "ag-grid-charts-enterprise/*",
                "ag-charts-enterprise/*",
                "@ag-grid-enterprise/*",
              ],
              message: AG_ENTERPRISE,
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...[
          "ImportExpression[source.value=/RE/]",
          "ImportExpression[source.quasis.0.value.cooked=/RE/]",
          "CallExpression[callee.name='require'][arguments.0.value=/RE/]",
          "CallExpression[callee.name='require'][arguments.0.quasis.0.value.cooked=/RE/]",
        ].map((s) => ({
          selector: s.replace(
            "RE",
            "^(@ag-grid-enterprise\\/|ag-grid-(charts-)?enterprise|ag-charts-enterprise)",
          ),
          message: AG_ENTERPRISE,
        })),
      ],
    },
  },
  prettier,
);
