/**
 * The site's origin. Canonical URLs, Open Graph images, robots.txt and the sitemap all come from
 * it; the Worker's custom domain in wrangler.jsonc must match.
 */
export const SITE_URL = "https://katip.qaynam.dev"

/**
 * Katip's Chrome Web Store listing, or null while it isn't published. While it is null, the pages
 * offer the release on GitHub instead of adding Katip from the store.
 */
export const CHROME_WEB_STORE_URL: string | null =
  "https://chromewebstore.google.com/detail/katip/khoieohhhleiegpcnppabdjmllajlmdp"

export const GITHUB_URL = "https://github.com/qaynam/Katip"
export const GITHUB_RELEASES_URL = `${GITHUB_URL}/releases`
export const GITHUB_LATEST_RELEASE_URL = `${GITHUB_RELEASES_URL}/latest`
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`
