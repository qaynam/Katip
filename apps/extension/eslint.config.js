import js from "@eslint/js"
import svelte from "eslint-plugin-svelte"
import globals from "globals"
import ts from "typescript-eslint"
import svelteConfig from "./svelte.config.js"

const crossModuleMessage =
  "Don't leave a module through a relative path; import the other module's public entry, such as #modules/<name>"

export default ts.config(
  { ignores: ["dist/", "node_modules/", ".e2e/", ".release/", ".claude/worktrees/"] },
  js.configs.recommended,
  ...ts.configs.strict,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker, chrome: "readonly" },
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/modules/*/*.ts", "src/platform/*/*.ts", "src/protocol/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^\\.\\./", message: crossModuleMessage }] },
      ],
    },
  },
  {
    files: ["src/modules/**/*.ts", "src/platform/**/*.ts", "src/protocol/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Program > :not(ImportDeclaration, ExportNamedDeclaration, ExportDefaultDeclaration, ExportAllDeclaration, VariableDeclaration, FunctionDeclaration, ClassDeclaration, TSTypeAliasDeclaration, TSInterfaceDeclaration, TSModuleDeclaration, TSEnumDeclaration, TSDeclareFunction)",
          message:
            "Only declarations at the top level: the build drops these modules from pages that use none of their exports (see vite.config.ts), and a statement run here would go with them",
        },
      ],
    },
  },
  {
    files: ["src/modules/*/*/*.ts", "src/platform/*/*/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^\\.\\./\\.\\./", message: crossModuleMessage }] },
      ],
    },
  },
)
