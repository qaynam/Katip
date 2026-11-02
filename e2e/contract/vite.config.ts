import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { buildManifest } from "../../src/apps/manifest"
import { CONTRACT_EXTENSION_DIR } from "../extension-dir"

// Katip の service worker を入れると、契約の場面が開いたタブやブックマークに反応して状態を
// 変えてしまう。同じ権限と、chrome.commands を生やすショートカットの宣言だけを持ち、
// 契約の場面だけを動かす別の拡張にする
const { permissions, minimum_chrome_version, commands } = buildManifest("production")

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
