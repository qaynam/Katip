import { Option, Schema } from "effect"
import { Action } from "#modules/actions"
import { FavoriteId } from "#modules/favorites"
import { SpaceId, SpaceName } from "#modules/space"
import { SpaceTheme } from "#modules/theme"
import { BookmarkId, TabId, WindowId } from "#platform/browser"
import { RequestId } from "./sidebar-port"

export const SPOTLIGHT_PORT_NAME = "katip/spotlight"

/** The Spotlight page's path from the extension's root. */
export const SPOTLIGHT_PAGE_PATH = "spotlight/index.html"

const CALLER_WINDOW_PARAM = "windowId"

/** The URL of the Spotlight page opened from the window `callerWindowId`. */
export const spotlightPageUrl = (extensionOrigin: string, callerWindowId: WindowId): string => {
  const url = new URL(SPOTLIGHT_PAGE_PATH, extensionOrigin)
  url.searchParams.set(CALLER_WINDOW_PARAM, String(callerWindowId))
  return url.href
}

const decodeWindowIdParam = Schema.decodeUnknownOption(
  Schema.FiniteFromString.pipe(Schema.decodeTo(WindowId)),
)

/** The window that opened Spotlight, read from the page's URL. None when the URL is malformed. */
export const callerWindowOfSpotlight = (pageUrl: string): Option.Option<WindowId> =>
  URL.canParse(pageUrl)
    ? decodeWindowIdParam(new URL(pageUrl).searchParams.get(CALLER_WINDOW_PARAM))
    : Option.none()

export const SpotlightResult = Schema.TaggedUnion({
  OpenTab: {
    tabId: TabId,
    title: Schema.String,
    url: Schema.String,
    favIconUrl: Schema.NullOr(Schema.String),
    // null for a tab in no Space, Favorites included
    spaceName: Schema.NullOr(SpaceName),
    isFavorite: Schema.Boolean,
    isInOtherWindow: Schema.Boolean,
  },
  // A closed pin. An open pin arrives as an OpenTab
  Pin: {
    bookmarkId: BookmarkId,
    title: Schema.String,
    url: Schema.String,
    spaceName: SpaceName,
    // Folder names from the top level of the Space down to the pin's parent folder
    folderPath: Schema.Array(Schema.String),
    isSplit: Schema.Boolean,
  },
  // A closed Favorite. An open one arrives as an OpenTab
  Favorite: { favoriteId: FavoriteId, title: Schema.String, url: Schema.String },
  Space: { spaceId: SpaceId, name: SpaceName, theme: SpaceTheme, isActive: Schema.Boolean },
  Bookmark: { bookmarkId: BookmarkId, title: Schema.String, url: Schema.String },
  // A page from the browsing history, leaving out URLs already among the open tabs, pins and
  // bookmarks
  History: { title: Schema.String, url: Schema.String, lastVisitedAt: Schema.Number },
  Action: {
    action: Action,
    // The name, translated into the display language
    title: Schema.String,
    // The assigned keys as written for display, such as "⇧⌘C". null when no key is assigned
    shortcut: Schema.NullOr(Schema.String),
  },
  // A command that opens a site, from those Katip comes with or those added in the settings
  SiteCommand: {
    // In the display language for one Katip comes with, as typed for an added one
    title: Schema.String,
    // The page it opens, with %s where the query goes for one that searches
    url: Schema.String,
    // What follows ! to use it with a query. null for a command without one
    keyword: Schema.NullOr(Schema.String),
    // Whether it searches for a query, which only its keyword can pass
    searches: Schema.Boolean,
    // A page of the site, for its favicon
    iconPageUrl: Schema.String,
  },
  // A search of one site, from a bang or a command's keyword typed with ! before or after the query
  SiteSearch: {
    siteName: Schema.String,
    // The trigger or keyword as typed, which Tab fills in while nothing follows it
    trigger: Schema.String,
    // Empty when nothing was typed besides the bang, which opens the site
    query: Schema.String,
    // The page to open, with the query filled in
    url: Schema.String,
    iconPageUrl: Schema.String,
  },
  // A bang the trigger being typed after ! can become. Choosing it fills in the trigger, ready for a
  // query, rather than opening anything
  BangSuggestion: { siteName: Schema.String, trigger: Schema.String, iconPageUrl: Schema.String },
  OpenUrl: { url: Schema.String },
  SearchWeb: { query: Schema.String },
})
export type SpotlightResult = typeof SpotlightResult.Type

export const SpotlightOutcome = Schema.TaggedUnion({
  Succeeded: {},
  Failed: { reason: Schema.String },
})
export type SpotlightOutcome = typeof SpotlightOutcome.Type

/**
 * `All` searches tabs, pins, history, commands and more together. `Actions` searches only
 * commands, and lists every command when the query is empty. `Site` is for a query that starts
 * with a bang, typed in the site the bang put Spotlight in: it finds the site's search alone.
 */
export const SpotlightMode = Schema.Literals(["All", "Actions", "Site"])
export type SpotlightMode = typeof SpotlightMode.Type

// windowId is the window that opened Spotlight, not Spotlight's own window
export const SpotlightClientMessage = Schema.TaggedUnion({
  Search: {
    requestId: RequestId,
    windowId: WindowId,
    query: Schema.String,
    mode: SpotlightMode,
  },
  Choose: { requestId: RequestId, windowId: WindowId, result: SpotlightResult },
})
export type SpotlightClientMessage = typeof SpotlightClientMessage.Type

export const SpotlightServerMessage = Schema.TaggedUnion({
  SearchResults: {
    requestId: RequestId,
    // In display order, top first
    results: Schema.Array(SpotlightResult),
    // The theme of the active Space in the window that opened Spotlight, which faintly tints
    // Spotlight's background
    spaceTheme: Schema.NullOr(SpaceTheme),
  },
  ChoiceSettled: { requestId: RequestId, outcome: SpotlightOutcome },
})
export type SpotlightServerMessage = typeof SpotlightServerMessage.Type
