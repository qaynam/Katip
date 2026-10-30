import { svelte } from "@sveltejs/vite-plugin-svelte"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig(({ mode }) => ({
  root: fromRoot("./src/apps"),
  publicDir: fromRoot("./public"),
  plugins: [svelte({ configFile: fromRoot("./svelte.config.js") })],
  build: {
    outDir: fromRoot("./dist"),
    emptyOutDir: true,
    sourcemap: mode === "development" ? "inline" : false,
    minify: mode !== "development",
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
}))
