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

// Their modules only declare things at the top level, which eslint.config.js holds them to
const sideEffectFreeRoots = ["./src/modules/", "./src/protocol/", "./src/platform/"].map(fromRoot)

type BuildMode = Manifest.BuildMode

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
      source: thirdPartyNotices(roots, [
        {
          name: "The list of bangs, from Kagi's bangs (https://github.com/kagisearch/bangs) as Helium ships them",
          licenseText: readFileSync(fromRoot("./src/modules/bangs/data/LICENSE"), "utf8"),
        },
        {
          name: "The approximate search, ported from node-asearch (https://github.com/shokai/node-asearch)",
          licenseText: readFileSync(fromRoot("./src/modules/asearch/LICENSE"), "utf8"),
        },
      ]),
    })
  },
})

// Vite writes each page's script tag anew and drops attributes it doesn't know, so the attribute
// that holds Spotlight's first frame back until its script has run is added to the built page
const holdSpotlightFirstFrame = (): Plugin => ({
  name: "katip:hold-spotlight-first-frame",
  transformIndexHtml: {
    order: "post",
    handler: (html, { path }) =>
      path.endsWith("/spotlight/index.html")
        ? html.replace('<script type="module"', '<script type="module" blocking="render"')
        : html,
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
  const buildMode: BuildMode =
    mode === "development" || mode === "chrome-web-store" ? mode : "production"
  return {
    root: fromRoot("./src/apps"),
    define: {
      "import.meta.env.KATIP_COMMITTED_AT": JSON.stringify(commitDate()),
      // Not for the store's package, even though GitHub has the same versions: a release's zip
      // would install beside the store's Katip as another one
      "import.meta.env.KATIP_UPDATED_FROM_GITHUB": JSON.stringify(buildMode !== "chrome-web-store"),
    },
    plugins: [
      svelte({ configFile: fromRoot("./svelte.config.js") }),
      emitManifest(buildMode),
      emitThirdPartyNotices(),
      holdSpotlightFirstFrame(),
      ...(buildMode === "development" ? [stampDevBuild()] : []),
    ],
    build: {
      outDir: fromRoot("./dist"),
      // In watch mode a failed build empties the output when it starts, and the extension that
      // was working can no longer load. Development builds leave stale files instead
      emptyOutDir: buildMode !== "development",
      sourcemap: buildMode === "development" ? "inline" : false,
      minify: buildMode !== "development",
      // A service worker has no document, so Vite must not inject its preload polyfill
      modulePreload: { polyfill: false },
      rolldownOptions: {
        // Not assumed to have side effects, as every module is by default: a module that a page
        // imports through a barrel but doesn't use would then be loaded and run on that page too,
        // such as the XML parser of live folders in Spotlight
        treeshake: {
          moduleSideEffects: (id: string) =>
            !sideEffectFreeRoots.some((root) => id.startsWith(root)),
        },
        input: {
          sidepanel: fromRoot("./src/apps/sidepanel/index.html"),
          options: fromRoot("./src/apps/options/index.html"),
          offscreen: fromRoot("./src/apps/offscreen/index.html"),
          spotlight: fromRoot("./src/apps/spotlight/index.html"),
          onboarding: fromRoot("./src/apps/onboarding/index.html"),
          background: fromRoot("./src/apps/background/main.ts"),
          "page-sound": fromRoot("./src/apps/page-sound/main.ts"),
        },
        output: {
          // manifest.json and the background refer to these by fixed paths, so they get no hash
          entryFileNames: (chunk) =>
            chunk.name === "background" || chunk.name === "page-sound"
              ? `${chunk.name}.js`
              : "assets/[name]-[hash].js",
        },
      },
    },
  }
})
