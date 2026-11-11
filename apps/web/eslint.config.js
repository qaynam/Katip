import js from "@eslint/js"
import astro from "eslint-plugin-astro"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import ts from "typescript-eslint"

export default defineConfig(
  globalIgnores(["dist/", ".astro/", ".wrangler/"]),
  js.configs.recommended,
  ts.configs.strict,
  astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
)
