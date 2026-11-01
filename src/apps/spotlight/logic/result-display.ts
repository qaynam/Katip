import { Array, Match, Option } from "effect"
import type { MessageKey, Translator } from "#modules/i18n"
import { swatchOf } from "#modules/theme"
import type { SpotlightResult } from "#protocol"
import { readableUrl } from "./readable-url"
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
  | { readonly _tag: "Command" }

export interface ResultDisplay {
  readonly title: string
  /** タイトルの下に添える補足。 */
  readonly detail: string
  readonly kindLabel: string
  readonly icon: ResultIcon
  /** コマンドに割り当てられたキーの書き方。コマンド以外と、割り当ての無いコマンドは null。 */
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
  Space: "spotlight.kind.space",
  Bookmark: "spotlight.kind.bookmark",
  History: "spotlight.kind.history",
  Action: "spotlight.kind.command",
  OpenUrl: "spotlight.kind.openUrl",
  SearchWeb: "spotlight.kind.searchWeb",
} as const satisfies Record<SpotlightResult["_tag"], MessageKey>

const titleOrUrl = (title: string, url: string) => (title.trim() === "" ? readableUrl(url) : title)

const neutralSwatch = swatchOf({ hue: 0, chroma: 0 })

/**
 * @param now - 履歴の「何日前」を数える基準の時刻（エポックミリ秒）。
 * @param translator - 補足と種類を書く言語。タイトルは background から届いたまま出す。
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
      icon: { _tag: "Command" },
      shortcut: command.shortcut,
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

/** 検索に一致した候補か。URL を開く項目とウェブ検索の項目は、何も一致しなくても出る。 */
export const isMatchedCandidate = (result: SpotlightResult): boolean =>
  result._tag !== "OpenUrl" && result._tag !== "SearchWeb"
