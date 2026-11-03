/**
 * The site's origin. Canonical URLs, hreflang alternates, Open Graph images, robots.txt and the
 * sitemap all come from it; the Worker's custom domain in wrangler.jsonc must match.
 */
export const SITE_URL = "https://katip.qaynam.dev"

/**
 * Katip's Chrome Web Store listing, or null until it is published. While it is null, the pages say
 * the listing is coming soon instead of offering "Add to Chrome".
 */
export const CHROME_WEB_STORE_URL: string | null = null

export const GITHUB_URL = "https://github.com/qaynam/Katip"
export const GITHUB_RELEASES_URL = `${GITHUB_URL}/releases`
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`
