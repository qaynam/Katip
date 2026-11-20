import { Option, Schema } from "effect"

/**
 * A site sound settings are kept for: the origin of its pages, such as `https://www.youtube.com`.
 * Another host of the same domain, such as `music.youtube.com`, is another site.
 */
export const SoundSite = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^https?:\/\/[^/?#\s]+$/)),
  Schema.brand("SoundSite"),
)
export type SoundSite = typeof SoundSite.Type

const decodeSite = Schema.decodeUnknownOption(SoundSite)

/** The site of a page at `url`. None for a page that isn't on the web, such as a browser page. */
export const soundSiteOf = (url: string): Option.Option<SoundSite> => {
  if (!URL.canParse(url)) return Option.none()
  const { protocol, origin } = new URL(url)
  return protocol === "https:" || protocol === "http:" ? decodeSite(origin) : Option.none()
}

/**
 * The host permission pattern that covers every page of `site`. Without the site's port, which
 * Chrome's match patterns don't take, so it covers the host's other ports too.
 */
export const originPatternOfSite = (site: SoundSite): string => {
  const { protocol, hostname } = new URL(site)
  return `${protocol}//${hostname}/*`
}

/** The site as people read it, without its scheme. */
export const hostOfSite = (site: SoundSite): string => new URL(site).host
