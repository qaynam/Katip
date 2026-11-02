import { svelte } from "@sveltejs/vite-plugin-svelte"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { defineConfig, type Plugin } from "vite"
import type { buildManifest } from "./src/apps/manifest"

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const manifestSource = fromRoot("./src/apps/manifest.ts")
const packageJsonPath = fromRoot("./package.json")

type BuildMode = "development" | "production"

// 設定ファイルから静的に import すると、ウォッチビルドは起動時のマニフェストと版を使い続ける。
// ビルドのたびに読み直し、マニフェストや版の変更も再ビルドのきっかけにする
const emitManifest = (mode: BuildMode): Plugin => ({
  name: "katip:emit-manifest",
  buildStart() {
    this.addWatchFile(manifestSource)
    this.addWatchFile(packageJsonPath)
  },
  async generateBundle() {
    const latest: { buildManifest: typeof buildManifest } = await import(
      `${pathToFileURL(manifestSource).href}?t=${Date.now()}`
    )
    const { version }: { version: string } = JSON.parse(readFileSync(packageJsonPath, "utf8"))
    this.emitFile({
      type: "asset",
      fileName: "manifest.json",
      source: JSON.stringify(latest.buildManifest(mode, version), null, 2),
    })
  },
})

// 開発ビルドの background はこの値の変化を見て自分を再読み込みする。全ファイルを書き終えた
// 後に書くので、書きかけのビルドを読み込ませることはない
const stampDevBuild = (): Plugin => ({
  name: "katip:stamp-dev-build",
  closeBundle() {
    writeFileSync(fromRoot("./dist/dev-build-id.txt"), String(Date.now()))
  },
})

export default defineConfig(({ mode }) => {
  const buildMode: BuildMode = mode === "development" ? "development" : "production"
  return {
    root: fromRoot("./src/apps"),
    plugins: [
      svelte({ configFile: fromRoot("./svelte.config.js") }),
      emitManifest(buildMode),
      ...(buildMode === "development" ? [stampDevBuild()] : []),
    ],
    build: {
      outDir: fromRoot("./dist"),
      // ウォッチ中は、失敗したビルドの開始時に出力先が空になり、動いていた拡張まで
      // 読み込めなくなる。開発時は古いファイルが残るのを許して、空にしない
      emptyOutDir: buildMode === "production",
      sourcemap: buildMode === "development" ? "inline" : false,
      minify: buildMode === "production",
      // サービスワーカーには document が無いため、Vite の preload ポリフィルを注入させない
      modulePreload: { polyfill: false },
      rolldownOptions: {
        input: {
          sidepanel: fromRoot("./src/apps/sidepanel/index.html"),
          options: fromRoot("./src/apps/options/index.html"),
          offscreen: fromRoot("./src/apps/offscreen/index.html"),
          spotlight: fromRoot("./src/apps/spotlight/index.html"),
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
