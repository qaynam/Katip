import sitemap from "@astrojs/sitemap"
import { defineConfig } from "astro/config"
import { SITE_URL } from "./src/site.ts"

export default defineConfig({
  site: SITE_URL,
  trailingSlash: "always",
  devToolbar: { enabled: false },
  integrations: [sitemap({ filter: (page) => !new URL(page).pathname.startsWith("/404") })],
  vite: {
    // Not inlined as data: URLs, which the Content-Security-Policy in public/_headers refuses
    build: { assetsInlineLimit: 0 },
  },
})
