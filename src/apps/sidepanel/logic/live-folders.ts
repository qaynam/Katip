import { originPatternOfKind, type LiveSource } from "#modules/live-folders"
import type { PinnedLiveFolderView } from "#protocol"

export type LiveSourceKind = LiveSource["_tag"]

/** Service names, shown untranslated in every language. */
export const liveSourceNames: Readonly<Record<LiveSourceKind, string>> = {
  Gmail: "Gmail",
  GitHub: "GitHub",
}

export const GITHUB_TOKEN_PAGE_URL =
  "https://github.com/settings/tokens/new?description=Katip&scopes=repo"

/**
 * Origins that need permission before reading from the source. Keep in sync with
 * optional_host_permissions in the manifest.
 */
export const sourceOrigins = (kind: LiveSourceKind): ReadonlyArray<string> => [
  originPatternOfKind(kind),
]

export const unseenCount = (folder: PinnedLiveFolderView): number =>
  folder.items.filter((item) => item.isUnseen).length

const BADGE_LIMIT = 99

/** Caps large counts at "99+" so the badge fits in the narrow header. */
export const unseenBadgeText = (count: number): string =>
  count > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(count)
