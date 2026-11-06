import { svelte } from "@sveltejs/vite-plugin-svelte"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig, type Plugin, runnerImport } from "vite"
import type * as Manifest from "./src/apps/manifest"
import { packageRootOf, thirdPartyNotices } from "./scripts/third-party-notices.ts"

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const manifestSource = fromRoot("./src/apps/manifest.ts")
const packageJsonPath = fromRoot("./package.json")

type BuildMode = "development" | "production"

// Not imported statically: a watch build would keep the manifest, version and translations it
// started with. Each build loads them afresh, and watches the files they came from
const emitManifest = (mode: BuildMode): Plugin => ({
  name: "katip:emit-manifest",
  async buildStart() {
    const { module, dependencies } = await runnerImport<typeof Manifest>(manifestSource, {
      root: fromRoot("."),
      logLevel: "warn",
    })
    for (const file of [manifestSource, packageJsonPath, ...dependencies]) this.addWatchFile(file)
    const { version }: { version: string } = JSON.parse(readFileSync(packageJsonPath, "utf8"))
    this.emitFile({
      type: "asset",
      fileName: "manifest.json",
      source: JSON.stringify(module.buildManifest(mode, version), null, 2),
    })
    for (const [directory, messages] of Object.entries(module.buildLocaleMessages())) {
      this.emitFile({
        type: "asset",
        fileName: `_locales/${directory}/messages.json`,
        source: JSON.stringify(messages, null, 2),
      })
    }
  },
})

// The development build's background reloads itself when this value changes. Written after every
// other file, so it never loads a half-written build
// Only modules that made it into the output count; a package imported but tree-shaken away isn't
// distributed
const emitThirdPartyNotices = (): Plugin => ({
  name: "katip:third-party-notices",
  generateBundle(_, bundle) {
    const roots = Object.values(bundle).flatMap((output) =>
      output.type === "chunk"
        ? Object.entries(output.modules).flatMap(([id, module]) => {
            const root = module.renderedLength > 0 ? packageRootOf(id) : null
            return root === null ? [] : [root]
          })
        : [],
    )
    this.emitFile({
      type: "asset",
      fileName: "THIRD_PARTY_NOTICES.txt",
      source: thirdPartyNotices(roots),
    })
  },
})

const stampDevBuild = (): Plugin => ({
  name: "katip:stamp-dev-build",
  closeBundle() {
    writeFileSync(fromRoot("./dist/dev-build-id.txt"), String(Date.now()))
  },
})

// The settings page shows it as the version's release date. Not the time of the build itself, so
// building the same commit again gives the same date
const commitDate = (): string => {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cI"], {
      cwd: fromRoot("."),
      encoding: "utf8",
    }).trim()
  } catch {
    return ""
  }
}

export default defineConfig(({ mode }) => {
  const buildMode: BuildMode = mode === "development" ? "development" : "production"
  return {
    root: fromRoot("./src/apps"),
    define: { "import.meta.env.KATIP_COMMITTED_AT": JSON.stringify(commitDate()) },
    plugins: [
      svelte({ configFile: fromRoot("./svelte.config.js") }),
      emitManifest(buildMode),
      emitThirdPartyNotices(),
      ...(buildMode === "development" ? [stampDevBuild()] : []),
    ],
    build: {
      outDir: fromRoot("./dist"),
      // In watch mode a failed build empties the output when it starts, and the extension that
      // was working can no longer load. Development builds leave stale files instead
      emptyOutDir: buildMode === "production",
      sourcemap: buildMode === "development" ? "inline" : false,
      minify: buildMode === "production",
      // A service worker has no document, so Vite must not inject its preload polyfill
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
          // manifest.json refers to it by a fixed path, so only background gets no hash
          entryFileNames: (chunk) =>
            chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        },
      },
    },
  }
})
