import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { defineCollection } from "astro:content"
import type { LoaderContext } from "astro/loaders"
import { z } from "astro/zod"
import { releasesIn } from "./changelog.ts"
import { LANGUAGES } from "./languages.ts"
import { splitPrivacyPolicy } from "./privacy-policy.ts"

/** Runs `load` now, and again whenever `file` changes while the dev server is running. */
const loadAndWatch = async (
  file: string,
  watcher: LoaderContext["watcher"],
  load: () => Promise<void>,
) => {
  await load()
  watcher?.add(file)
  watcher?.on("change", (changed) => {
    if (changed === file) void load()
  })
}

/** Loads each translation of the repository's PRIVACY.md as an entry named by its language. */
const loadPrivacyPolicy = async ({
  config,
  store,
  renderMarkdown,
  generateDigest,
  watcher,
}: LoaderContext) => {
  const file = fileURLToPath(new URL("../../PRIVACY.md", config.root))
  await loadAndWatch(file, watcher, async () => {
    const policy = splitPrivacyPolicy(await readFile(file, "utf8"))
    store.clear()
    for (const language of LANGUAGES) {
      const body = policy[language]
      store.set({
        id: language,
        data: {},
        body,
        rendered: await renderMarkdown(body),
        digest: generateDigest(body),
      })
    }
  })
}

/**
 * Loads each released version's English notes from the repository's CHANGELOG.md as an entry
 * named by the version, with its order in the file, newest first, as `order`.
 */
const loadReleases = async ({
  config,
  store,
  parseData,
  generateDigest,
  watcher,
}: LoaderContext) => {
  const file = fileURLToPath(new URL("../../CHANGELOG.md", config.root))
  await loadAndWatch(file, watcher, async () => {
    const releases = releasesIn(await readFile(file, "utf8"))
    store.clear()
    for (const [order, release] of releases.entries()) {
      const data = await parseData({ id: release.version, data: { ...release, order } })
      store.set({ id: release.version, data, digest: generateDigest(data) })
    }
  })
}

const release = z.object({
  version: z.string(),
  date: z.string(),
  summary: z.string(),
  order: z.number(),
  groups: z.array(
    z.object({
      kind: z.enum(["new", "improved", "fixed"]),
      changes: z.array(z.object({ name: z.string(), description: z.string() })),
    }),
  ),
})

export const collections = {
  privacy: defineCollection({ loader: { name: "privacy-policy", load: loadPrivacyPolicy } }),
  releases: defineCollection({
    loader: { name: "changelog", load: loadReleases },
    schema: release,
  }),
}
