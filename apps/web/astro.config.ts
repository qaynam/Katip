import sitemap from "@astrojs/sitemap"
import { defineConfig } from "astro/config"
import { DEFAULT_LANGUAGE, LANGUAGES } from "./src/languages.ts"
import { SITE_URL } from "./src/site.ts"

const isTranslatedPage = (page: string) =>
  LANGUAGES.some((language) => new URL(page).pathname.startsWith(`/${language}/`))

export default defineConfig({
  site: SITE_URL,
  trailingSlash: "always",
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      // The root only redirects, so the sitemap lists the pages it leads to
      filter: isTranslatedPage,
      i18n: {
        defaultLocale: DEFAULT_LANGUAGE,
        locales: Object.fromEntries(LANGUAGES.map((language) => [language, language])),
      },
    }),
  ],
})
