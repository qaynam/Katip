import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { defineCollection } from "astro:content"
import type { LoaderContext } from "astro/loaders"
import { LANGUAGES } from "./languages.ts"
import { splitPrivacyPolicy } from "./privacy-policy.ts"

/** Loads each translation of the repository's PRIVACY.md as an entry named by its language. */
const loadPrivacyPolicy = async ({
  config,
  store,
  renderMarkdown,
  generateDigest,
  watcher,
}: LoaderContext) => {
  const file = fileURLToPath(new URL("../../PRIVACY.md", config.root))
  const load = async () => {
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
  }
  await load()
  watcher?.add(file)
  watcher?.on("change", (changed) => {
    if (changed === file) void load()
  })
}

export const collections = {
  privacy: defineCollection({ loader: { name: "privacy-policy", load: loadPrivacyPolicy } }),
}
