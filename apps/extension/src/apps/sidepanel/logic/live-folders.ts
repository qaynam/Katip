import {
  gmailMailboxUrl,
  listsUnreadOnly,
  originPatternOf,
  type LiveSource,
} from "#modules/live-folders"
import type { PinnedLiveFolderView } from "#protocol"

export type LiveSourceKind = LiveSource["_tag"]

/** Service names, shown untranslated in every language. */
export const liveSourceNames: Readonly<Record<LiveSourceKind, string>> = {
  Gmail: "Gmail",
  GitHub: "GitHub",
}

/** The page of the source whose favicon stands for its live folders. */
export const liveSourceSiteUrl = (source: LiveSource): string =>
  source._tag === "Gmail" ? gmailMailboxUrl(source.accountIndex) : "https://github.com/"

export const GITHUB_TOKEN_PAGE_URL =
  "https://github.com/settings/tokens/new?description=Katip&scopes=repo"

/**
 * Origins that need permission before reading from the source. Keep in sync with
 * optional_host_permissions in the manifest.
 */
export const sourceOrigins = (source: LiveSource): ReadonlyArray<string> => [
  originPatternOf(source),
]

/**
 * Whether the folder marks its items unread: one that lists what's unread, as an inbox does. Not
 * a folder of GitHub searches, whose review requests and pull requests are there to be done
 * rather than read.
 */
export const marksUnread = (folder: PinnedLiveFolderView): boolean => listsUnreadOnly(folder.source)

/** Counts the items the folder's limit holds back too. None for a folder that marks none. */
export const unseenCount = (folder: PinnedLiveFolderView): number =>
  marksUnread(folder)
    ? [...folder.items, ...folder.hiddenItems].filter((item) => item.isUnseen).length
    : 0

const BADGE_LIMIT = 99

/** Caps large counts at "99+" so the badge fits in the narrow header. */
export const unseenBadgeText = (count: number): string =>
  count > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(count)
