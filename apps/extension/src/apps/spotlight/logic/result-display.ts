import { Array, Match, Option } from "effect"
import { inputForTrigger } from "#modules/bangs"
import type { MessageKey, Translator } from "#modules/i18n"
import { swatchOf } from "#modules/theme"
import type { SpotlightResult } from "#protocol"
import { type ActionGlyph, actionGlyphOf } from "./action-glyph"
import { hostOf, readableUrl } from "./readable-url"
import { relativeTimeLabel } from "./relative-time"

export type ResultIcon =
  | {
      readonly _tag: "Favicon"
      readonly pageUrl: string
      readonly favIconUrl: string | null
      readonly title: string
    }
  | { readonly _tag: "Swatch"; readonly color: string }
  | { readonly _tag: "Search" }
  | { readonly _tag: "Glyph"; readonly glyph: ActionGlyph }

export interface ResultDisplay {
  readonly title: string
  /** The line under the title. */
  readonly detail: string
  readonly kindLabel: string
  readonly icon: ResultIcon
  /** The keys assigned to a command, as written for display. null unless a command has keys. */
  readonly shortcut: string | null
}

const joinDetail = (parts: ReadonlyArray<string | null>) =>
  parts.filter((part): part is string => part !== null && part !== "").join(" · ")

const favicon = (pageUrl: string, title: string, favIconUrl: string | null = null): ResultIcon => ({
  _tag: "Favicon",
  pageUrl,
  favIconUrl,
  title,
})

const withoutShortcut = (display: Omit<ResultDisplay, "shortcut">): ResultDisplay => ({
  ...display,
  shortcut: null,
})

const kindLabels = {
  OpenTab: "spotlight.kind.tab",
  Pin: "spotlight.kind.pin",
  Favorite: "spotlight.kind.favorite",
  Space: "spotlight.kind.space",
  Bookmark: "spotlight.kind.bookmark",
  History: "spotlight.kind.history",
  Action: "spotlight.kind.command",
  SiteCommand: "spotlight.kind.command",
  SiteSearch: "spotlight.kind.siteSearch",
  BangSuggestion: "spotlight.kind.siteSearch",
  OpenUrl: "spotlight.kind.openUrl",
  SearchWeb: "spotlight.kind.searchWeb",
} as const satisfies Record<SpotlightResult["_tag"], MessageKey>

const titleOrUrl = (title: string, url: string) => (title.trim() === "" ? readableUrl(url) : title)

const neutralSwatch = swatchOf({ hue: 0, chroma: 0 })

/**
 * @param now - The time a history page's "days ago" counts from, in epoch milliseconds.
 * @param translator - The language of the detail and kind. Titles show as the background sent them.
 */
export const displayOf = (
  result: SpotlightResult,
  now: number,
  translator: Translator,
): ResultDisplay => {
  const { t } = translator
  const kindLabel = t(kindLabels[result._tag])
  const placeOfTab = (tab: Extract<SpotlightResult, { _tag: "OpenTab" }>) =>
    tab.isFavorite
      ? t("spotlight.detail.favorites")
      : (tab.spaceName ?? t("spotlight.detail.notInSpace"))
  return Match.valueTags(result, {
    OpenTab: (tab) =>
      withoutShortcut({
        title: tab.title,
        detail: joinDetail([
          placeOfTab(tab),
          tab.isInOtherWindow ? t("spotlight.detail.otherWindow") : null,
          readableUrl(tab.url),
        ]),
        kindLabel,
        icon: favicon(tab.url, tab.title, tab.favIconUrl),
      }),
    Pin: (pin) =>
      withoutShortcut({
        title: pin.title,
        detail: joinDetail([
          [pin.spaceName, ...pin.folderPath].join(" › "),
          pin.isSplit ? t("spotlight.detail.splitView") : readableUrl(pin.url),
        ]),
        kindLabel,
        icon: favicon(pin.url, pin.title),
      }),
    Favorite: (favorite) => {
      const title = titleOrUrl(favorite.title, favorite.url)
      return withoutShortcut({
        title,
        detail: joinDetail([t("spotlight.detail.favorites"), readableUrl(favorite.url)]),
        kindLabel,
        icon: favicon(favorite.url, title),
      })
    },
    Space: (space) =>
      withoutShortcut({
        title: space.name,
        detail: space.isActive
          ? t("spotlight.detail.currentSpace")
          : t("spotlight.detail.switchToSpace"),
        kindLabel,
        icon: {
          _tag: "Swatch",
          color: Option.getOrElse(
            Option.map(Array.head(space.theme.colors), swatchOf),
            () => neutralSwatch,
          ),
        },
      }),
    Bookmark: (bookmark) => {
      const title = titleOrUrl(bookmark.title, bookmark.url)
      return withoutShortcut({
        title,
        detail: readableUrl(bookmark.url),
        kindLabel,
        icon: favicon(bookmark.url, title),
      })
    },
    History: (page) => {
      const title = titleOrUrl(page.title, page.url)
      return withoutShortcut({
        title,
        detail: joinDetail([
          readableUrl(page.url),
          relativeTimeLabel(page.lastVisitedAt, now, translator),
        ]),
        kindLabel,
        icon: favicon(page.url, title),
      })
    },
    Action: (command): ResultDisplay => ({
      title: command.title,
      detail: "",
      kindLabel,
      icon: { _tag: "Glyph", glyph: actionGlyphOf(command.action) },
      shortcut: command.shortcut,
    }),
    SiteCommand: (command) =>
      withoutShortcut({
        title: command.title,
        // A command that searches has %s in its URL, which says nothing to the reader; its host
        // and keyword do
        detail: command.searches
          ? joinDetail([
              command.keyword === null ? null : `!${command.keyword}`,
              Option.getOrNull(hostOf(command.iconPageUrl)),
            ])
          : readableUrl(command.url),
        kindLabel,
        icon: favicon(command.iconPageUrl, command.title),
      }),
    SiteSearch: (search) =>
      withoutShortcut({
        title: search.query === "" ? search.siteName : search.query,
        detail:
          search.query === ""
            ? t("spotlight.detail.openSite", { site: search.siteName })
            : t("spotlight.detail.searchSite", { site: search.siteName }),
        kindLabel,
        icon: favicon(search.iconPageUrl, search.siteName),
      }),
    BangSuggestion: (suggestion) =>
      withoutShortcut({
        title: suggestion.siteName,
        detail: `!${suggestion.trigger}`,
        kindLabel,
        icon: favicon(suggestion.iconPageUrl, suggestion.siteName),
      }),
    OpenUrl: ({ url }) =>
      withoutShortcut({
        title: url,
        detail: t("spotlight.detail.openInNewTab"),
        kindLabel,
        icon: favicon(url, url),
      }),
    SearchWeb: ({ query }) =>
      withoutShortcut({
        title: query,
        detail: t("spotlight.detail.searchTheWeb"),
        kindLabel,
        icon: { _tag: "Search" },
      }),
  })
}

/** A site that a bang or a command's keyword searches, which Spotlight can be put in to type a query for. */
export interface BangMode {
  /** The trigger or keyword, written after ! to search the site. */
  readonly trigger: string
  readonly siteName: string
  /** A page of the site, for its favicon. */
  readonly iconPageUrl: string
}

/** The site Tab puts Spotlight in from the result, ready for the query. Null for anything else. */
export const bangModeOf = (result: SpotlightResult): BangMode | null => {
  switch (result._tag) {
    case "BangSuggestion":
      return { trigger: result.trigger, siteName: result.siteName, iconPageUrl: result.iconPageUrl }
    case "SiteSearch":
      return result.query === ""
        ? { trigger: result.trigger, siteName: result.siteName, iconPageUrl: result.iconPageUrl }
        : null
    case "SiteCommand":
      return result.searches && result.keyword !== null
        ? { trigger: result.keyword, siteName: result.title, iconPageUrl: result.iconPageUrl }
        : null
    default:
      return null
  }
}

/**
 * The site choosing the result puts Spotlight in, rather than opening anything. A site search is
 * opened even with nothing typed after its bang, which opens the site itself.
 */
export const bangModeOnChoosing = (result: SpotlightResult): BangMode | null =>
  result._tag === "SiteSearch" ? null : bangModeOf(result)

/** What Spotlight searches for: in a site's mode, its bang followed by what is typed. */
export const searchTextIn = (mode: BangMode | null, typed: string): string =>
  mode === null ? typed : inputForTrigger(mode.trigger) + typed

/** Whether the result matched the query. Opening a URL and searching the web show up regardless. */
export const isMatchedCandidate = (result: SpotlightResult): boolean =>
  result._tag !== "OpenUrl" && result._tag !== "SearchWeb"
