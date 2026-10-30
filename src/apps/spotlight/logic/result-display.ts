import { Array, Match, Option } from "effect"
import { swatchOf } from "#modules/theme"
import type { SpotlightResult } from "#protocol"
import { strings } from "../strings"
import { readableUrl } from "./readable-url"

export type ResultIcon =
  | {
      readonly _tag: "Favicon"
      readonly pageUrl: string
      readonly favIconUrl: string | null
      readonly title: string
    }
  | { readonly _tag: "Swatch"; readonly color: string }
  | { readonly _tag: "Search" }

export interface ResultDisplay {
  readonly title: string
  /** タイトルの下に添える補足。 */
  readonly detail: string
  readonly kindLabel: string
  readonly icon: ResultIcon
}

const joinDetail = (parts: ReadonlyArray<string | null>) =>
  parts.filter((part): part is string => part !== null && part !== "").join(" · ")

const favicon = (pageUrl: string, title: string, favIconUrl: string | null = null): ResultIcon => ({
  _tag: "Favicon",
  pageUrl,
  favIconUrl,
  title,
})

const placeOfTab = (tab: Extract<SpotlightResult, { _tag: "OpenTab" }>) =>
  tab.isFavorite ? strings.favorites : (tab.spaceName ?? strings.outsideSpaces)

const neutralSwatch = swatchOf({ hue: 0, chroma: 0 })

export const displayOf = (result: SpotlightResult): ResultDisplay =>
  Match.valueTags(result, {
    OpenTab: (tab): ResultDisplay => ({
      title: tab.title,
      detail: joinDetail([
        placeOfTab(tab),
        tab.isInOtherWindow ? strings.otherWindow : null,
        readableUrl(tab.url),
      ]),
      kindLabel: strings.kind.OpenTab,
      icon: favicon(tab.url, tab.title, tab.favIconUrl),
    }),
    Pin: (pin): ResultDisplay => ({
      title: pin.title,
      detail: joinDetail([
        [pin.spaceName, ...pin.folderPath].join(" › "),
        pin.isSplit ? strings.splitView : readableUrl(pin.url),
      ]),
      kindLabel: strings.kind.Pin,
      icon: favicon(pin.url, pin.title),
    }),
    Space: (space): ResultDisplay => ({
      title: space.name,
      detail: space.isActive ? strings.currentSpace : strings.switchSpace,
      kindLabel: strings.kind.Space,
      icon: {
        _tag: "Swatch",
        color: Option.getOrElse(
          Option.map(Array.head(space.theme.colors), swatchOf),
          () => neutralSwatch,
        ),
      },
    }),
    Bookmark: (bookmark): ResultDisplay => {
      const title = bookmark.title.trim() === "" ? readableUrl(bookmark.url) : bookmark.title
      return {
        title,
        detail: readableUrl(bookmark.url),
        kindLabel: strings.kind.Bookmark,
        icon: favicon(bookmark.url, title),
      }
    },
    OpenUrl: ({ url }): ResultDisplay => ({
      title: url,
      detail: strings.openInNewTab,
      kindLabel: strings.kind.OpenUrl,
      icon: favicon(url, url),
    }),
    SearchWeb: ({ query }): ResultDisplay => ({
      title: query,
      detail: strings.searchWithDefaultEngine,
      kindLabel: strings.kind.SearchWeb,
      icon: { _tag: "Search" },
    }),
  })

/** 検索に一致した候補か。URL を開く項目とウェブ検索の項目は、何も一致しなくても出る。 */
export const isMatchedCandidate = (result: SpotlightResult): boolean =>
  result._tag !== "OpenUrl" && result._tag !== "SearchWeb"
