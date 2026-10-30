import { svelte } from "@sveltejs/vite-plugin-svelte"
import { writeFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build, defineConfig, type Plugin, type Rolldown } from "vite"
import type { buildManifest } from "./src/apps/manifest"

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const manifestSource = fromRoot("./src/apps/manifest.ts")

type BuildMode = "development" | "production"

// 設定ファイルから静的に import すると、ウォッチビルドは起動時のマニフェストを使い続ける。
// ビルドのたびに読み直し、マニフェストの変更も再ビルドのきっかけにする
const emitManifest = (mode: BuildMode): Plugin => ({
  name: "katip:emit-manifest",
  buildStart() {
    this.addWatchFile(manifestSource)
  },
  async generateBundle() {
    const latest: { buildManifest: typeof buildManifest } = await import(
      `${pathToFileURL(manifestSource).href}?t=${Date.now()}`
    )
    this.emitFile({
      type: "asset",
      fileName: "manifest.json",
      source: JSON.stringify(latest.buildManifest(mode), null, 2),
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

// src/protocol の PAGE_SHORTCUT_SCRIPT_PATH と同じ値。src/protocol は effect や #modules に
// 依存するので、ビルドの設定からは読み込まない
const PAGE_SHORTCUT_SCRIPT_FILE = "page-shortcuts.js"
const pageShortcutsEntry = fromRoot("./src/apps/page-shortcuts/main.ts")
const pageShortcutsSources = [
  fromRoot("./src/apps/page-shortcuts/"),
  fromRoot("./src/modules/page-shortcuts/"),
]
// すべてのページで読み込まれるので、ライブラリを取り込んでいないことを大きさでも確かめる
const PAGE_SHORTCUTS_MAX_BYTES = 16 * 1024

const entryChunkOf = (
  output: Awaited<ReturnType<typeof build>>,
): Rolldown.OutputChunk | undefined =>
  (Array.isArray(output) ? output : [output])
    .flatMap((result) => ("output" in result ? result.output : []))
    .find((file): file is Rolldown.OutputChunk => file.type === "chunk" && file.isEntry)

const pageShortcutsProblems = (
  chunk: Rolldown.OutputChunk,
  mode: BuildMode,
): ReadonlyArray<string> => [
  ...(chunk.imports.length > 0 || chunk.dynamicImports.length > 0
    ? [`ほかのファイルを読み込んでいる: ${[...chunk.imports, ...chunk.dynamicImports].join(", ")}`]
    : []),
  ...(/^\s*(import|export)\b|\bimport\s*\(/m.test(chunk.code)
    ? ["import か export が残っていて、classic script として読み込めない"]
    : []),
  ...chunk.moduleIds
    .filter((id) => !id.startsWith("\0"))
    .filter((id) => !pageShortcutsSources.some((source) => id.startsWith(source)))
    .map((id) => `ページのスクリプトに含めないはずのモジュールを含む: ${id}`),
  ...(mode === "production" && chunk.code.length > PAGE_SHORTCUTS_MAX_BYTES
    ? [`${chunk.code.length} バイトあり、${PAGE_SHORTCUTS_MAX_BYTES} バイトを超えている`]
    : []),
]

// content script は ES module にできない。複数の入力をまとめるビルドに加えると、共有チャンクへの
// import が入りうる。ページのスクリプトだけを別にビルドして、import の無い 1 つのファイルにする
const emitPageShortcutsScript = (mode: BuildMode): Plugin => {
  let script = ""
  return {
    name: "katip:page-shortcuts-script",
    async buildStart() {
      const output = await build({
        configFile: false,
        root: fromRoot("."),
        mode,
        logLevel: "warn",
        publicDir: false,
        build: {
          write: false,
          minify: mode === "production",
          sourcemap: mode === "development" ? "inline" : false,
          lib: {
            entry: pageShortcutsEntry,
            formats: ["iife"],
            name: "katipPageShortcuts",
            fileName: () => PAGE_SHORTCUT_SCRIPT_FILE,
          },
        },
      })
      const chunk = entryChunkOf(output)
      if (chunk === undefined) return this.error("ページのスクリプトを出力できなかった")
      const problems = pageShortcutsProblems(chunk, mode)
      if (problems.length > 0) {
        return this.error(`${PAGE_SHORTCUT_SCRIPT_FILE}: ${problems.join(" / ")}`)
      }
      // ウォッチ中は、ページのスクリプトの変更でもビルドし直させる
      for (const id of chunk.moduleIds) if (!id.startsWith("\0")) this.addWatchFile(id)
      script = chunk.code
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: PAGE_SHORTCUT_SCRIPT_FILE, source: script })
    },
  }
}

export default defineConfig(({ mode }) => {
  const buildMode: BuildMode = mode === "development" ? "development" : "production"
  return {
    root: fromRoot("./src/apps"),
    plugins: [
      svelte({ configFile: fromRoot("./svelte.config.js") }),
      emitManifest(buildMode),
      emitPageShortcutsScript(buildMode),
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
