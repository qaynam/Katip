import type { Catalog, MessageKey } from "./catalog"
import { common as enCommon } from "./catalogs/en/common"
import { spotlight as enSpotlight } from "./catalogs/en/spotlight"
import { common as esCommon } from "./catalogs/es/common"
import { spotlight as esSpotlight } from "./catalogs/es/spotlight"
import { common as jaCommon } from "./catalogs/ja/common"
import { spotlight as jaSpotlight } from "./catalogs/ja/spotlight"
import { common as zhCommon } from "./catalogs/zh/common"
import { spotlight as zhSpotlight } from "./catalogs/zh/spotlight"
import type { Locale } from "./locale"

/** The keys of the messages the Command Palette shows. */
export type SpotlightMessageKey = Extract<MessageKey, `spotlight.${string}` | `common.${string}`>

/**
 * The part of each catalog the Command Palette shows.
 *
 * @remarks
 * Built into its script rather than read from the file of its language as other pages do: its first
 * frame is held back only until the script has run, and a frame drawn while the file was still
 * being read would show before the Command Palette.
 */
export const spotlightCatalogs: {
  readonly [L in Locale]: Pick<Catalog, SpotlightMessageKey>
} = {
  en: { ...enCommon, ...enSpotlight },
  es: { ...esCommon, ...esSpotlight },
  ja: { ...jaCommon, ...jaSpotlight },
  zh: { ...zhCommon, ...zhSpotlight },
}
