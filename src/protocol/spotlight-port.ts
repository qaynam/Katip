import { Option, Schema } from "effect"
import { Action } from "#modules/actions"
import { SpaceId, SpaceName } from "#modules/space"
import { SpaceTheme } from "#modules/theme"
import { BookmarkId, TabId, WindowId } from "#platform/browser"
import { RequestId } from "./sidebar-port"

export const SPOTLIGHT_PORT_NAME = "katip/spotlight"

/** 拡張のルートから見た Spotlight のページの位置。 */
export const SPOTLIGHT_PAGE_PATH = "spotlight/index.html"

const CALLER_WINDOW_PARAM = "windowId"

/** `callerWindowId` のウィンドウから開いた Spotlight のページの URL。 */
export const spotlightPageUrl = (extensionOrigin: string, callerWindowId: WindowId): string => {
  const url = new URL(SPOTLIGHT_PAGE_PATH, extensionOrigin)
  url.searchParams.set(CALLER_WINDOW_PARAM, String(callerWindowId))
  return url.href
}

const decodeWindowIdParam = Schema.decodeUnknownOption(
  Schema.FiniteFromString.pipe(Schema.decodeTo(WindowId)),
)

/** Spotlight のページの URL から、開いたウィンドウを読み取る。URL が壊れていれば None。 */
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
    // null はどの Space にも属さないタブ（Favorites もここに入る）
    spaceName: Schema.NullOr(SpaceName),
    isFavorite: Schema.Boolean,
    isInOtherWindow: Schema.Boolean,
  },
  // 閉じているピン。開いているピンは OpenTab として届く
  Pin: {
    bookmarkId: BookmarkId,
    title: Schema.String,
    url: Schema.String,
    spaceName: SpaceName,
    // Space 直下からピンの親フォルダまでのフォルダ名
    folderPath: Schema.Array(Schema.String),
    isSplit: Schema.Boolean,
  },
  Space: { spaceId: SpaceId, name: SpaceName, theme: SpaceTheme, isActive: Schema.Boolean },
  Bookmark: { bookmarkId: BookmarkId, title: Schema.String, url: Schema.String },
  // 閲覧履歴のページ。開いているタブ・ピン・ブックマークと同じ URL のものは除いてある
  History: { title: Schema.String, url: Schema.String, lastVisitedAt: Schema.Number },
  Action: {
    action: Action,
    // 表示する言語に訳した名前
    title: Schema.String,
    // 割り当てられているキーの書き方（「⇧⌘C」など）。割り当てが無ければ null
    shortcut: Schema.NullOr(Schema.String),
  },
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
 * `All` はタブ・ピン・履歴・コマンドなどをまとめて探す。`Actions` はコマンドだけを探し、
 * 入力が空ならすべてのコマンドを並べる。
 */
export const SpotlightMode = Schema.Literals(["All", "Actions"])
export type SpotlightMode = typeof SpotlightMode.Type

// windowId は Spotlight を開いたウィンドウ。Spotlight 自身のウィンドウではない
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
    // 上から表示する順
    results: Schema.Array(SpotlightResult),
    // 開いたウィンドウのアクティブな Space のテーマ。Spotlight の背景をほのかに染める
    spaceTheme: Schema.NullOr(SpaceTheme),
  },
  ChoiceSettled: { requestId: RequestId, outcome: SpotlightOutcome },
})
export type SpotlightServerMessage = typeof SpotlightServerMessage.Type
