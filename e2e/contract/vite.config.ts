import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { buildManifest } from "../../src/apps/manifest"
import { CONTRACT_EXTENSION_DIR } from "../extension-dir"

// Not Katip's own extension: its service worker would react to the tabs and bookmarks the
// scenarios create and change the state under observation. This extension carries only the same
// permissions, plus the shortcut declarations that make chrome.commands exist
const { permissions, minimum_chrome_version, commands } = buildManifest("production", "0.0.0")

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  logLevel: "warn",
  plugins: [
    {
      name: "katip:contract-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify({
            manifest_version: 3,
            name: "Katip browser contract",
            version: "0.0.0",
            minimum_chrome_version,
            permissions,
            commands,
            background: { service_worker: "runner.js", type: "module" },
          }),
        })
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
