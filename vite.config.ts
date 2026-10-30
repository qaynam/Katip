import { svelte } from "@sveltejs/vite-plugin-svelte"
import { fileURLToPath } from "node:url"
import { defineConfig, type Plugin } from "vite"
import { buildManifest } from "./src/apps/manifest"

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const emitManifest = (mode: "development" | "production"): Plugin => ({
  name: "katip:emit-manifest",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "manifest.json",
      source: JSON.stringify(buildManifest(mode), null, 2),
    })
  },
})

export default defineConfig(({ mode }) => {
  const buildMode = mode === "development" ? "development" : "production"
  return {
    root: fromRoot("./src/apps"),
    plugins: [svelte({ configFile: fromRoot("./svelte.config.js") }), emitManifest(buildMode)],
    build: {
      outDir: fromRoot("./dist"),
      emptyOutDir: true,
      sourcemap: buildMode === "development" ? "inline" : false,
      minify: buildMode === "production",
      // サービスワーカーには document が無いため、Vite の preload ポリフィルを注入させない
      modulePreload: { polyfill: false },
      rolldownOptions: {
        input: {
          sidepanel: fromRoot("./src/apps/sidepanel/index.html"),
          options: fromRoot("./src/apps/options/index.html"),
          background: fromRoot("./src/apps/background/main.ts"),
        },
        output: {
          // manifest.json から固定パスで参照されるため、background だけはハッシュを付けない
          entryFileNames: (chunk) =>
            chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        },
      },
    },
  }
})
