import { fileURLToPath } from "node:url"
import { defineConfig, runnerImport } from "vite"
import type * as Manifest from "../../src/apps/manifest"
import { CONTRACT_EXTENSION_DIR } from "../extension-dir"

const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

// Not Katip's own extension: its service worker would react to the tabs and bookmarks the
// scenarios create and change the state under observation. This extension carries only the same
// permissions, plus the shortcut declarations that make chrome.commands exist. Their descriptions
// are translated messages, so the translations come along too
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  logLevel: "warn",
  plugins: [
    {
      name: "katip:contract-manifest",
      // Not imported statically: bundling the config would pull the translations into it
      async generateBundle() {
        const { module } = await runnerImport<typeof Manifest>(fromRoot("src/apps/manifest.ts"), {
          root: fromRoot("."),
          logLevel: "warn",
        })
        const { permissions, minimum_chrome_version, commands, default_locale } =
          module.buildManifest("production", "0.0.0")
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify({
            manifest_version: 3,
            name: "Katip browser contract",
            version: "0.0.0",
            minimum_chrome_version,
            default_locale,
            permissions,
            commands,
            background: { service_worker: "runner.js", type: "module" },
          }),
        })
        for (const [directory, messages] of Object.entries(module.buildLocaleMessages())) {
          this.emitFile({
            type: "asset",
            fileName: `_locales/${directory}/messages.json`,
            source: JSON.stringify(messages),
          })
        }
      },
    },
  ],
  build: {
    outDir: CONTRACT_EXTENSION_DIR,
    emptyOutDir: true,
    minify: false,
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: { runner: fileURLToPath(new URL("./runner.ts", import.meta.url)) },
      output: { entryFileNames: "[name].js" },
    },
  },
})
