// Not a real site's page: .invalid never resolves, so no icon can have been saved for it
const PAGE_WITHOUT_FAVICON = "https://katip.invalid/"

const checks = new Map<string, Promise<boolean>>()

const bytesAt = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer())

const isSameBytes = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index])

const readSaved = async (siteUrl: string, resolve: (pageUrl: string) => string | null) => {
  const url = resolve(siteUrl)
  const fallback = resolve(PAGE_WITHOUT_FAVICON)
  if (url === null || fallback === null) return false
  const [icon, placeholder] = await Promise.all([bytesAt(url), bytesAt(fallback)])
  return !isSameBytes(icon, placeholder)
}

/**
 * Whether the browser saved a favicon for the site, as it does for sites visited before.
 *
 * @remarks
 * For any other site the favicon URL still gives an image, the browser's default globe, so the
 * image is told apart from that default by its bytes. False when it can't be read. Checked once per
 * site for as long as the side panel stays open.
 */
export const hasSavedFavicon = (
  siteUrl: string,
  resolve: (pageUrl: string) => string | null,
): Promise<boolean> => {
  const known = checks.get(siteUrl)
  if (known !== undefined) return known
  const saved = readSaved(siteUrl, resolve).catch(() => false)
  checks.set(siteUrl, saved)
  return saved
}
