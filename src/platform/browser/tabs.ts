import { Array, Context, Effect, Layer, Option } from "effect"
import { type BrowserApiError, callChrome, requirePresent } from "./browser-api-error"
import { tabGroupIdToChrome } from "./chrome-values"
import { TabGroupId, type TabId, type WindowId } from "./ids"
import { type BrowserTab, fromChromeTab } from "./tab"

export interface TabQuery {
  readonly windowId?: WindowId
  readonly lastFocusedWindow?: boolean
  readonly active?: boolean
  readonly pinned?: boolean
  readonly audible?: boolean
  readonly discarded?: boolean
  /** `None` はどのグループにも属さないタブ。 */
  readonly groupId?: Option.Option<TabGroupId>
}

export interface TabCreateOptions {
  /** 省略時は最後にフォーカスされたウィンドウ。 */
  readonly windowId?: WindowId
  readonly index?: number
  readonly url?: string
  /** 省略時は `true`。 */
  readonly active?: boolean
  readonly pinned?: boolean
  readonly openerTabId?: TabId
}

export interface TabUpdateOptions {
  readonly url?: string
  /** `false` は無視される。アクティブなタブを外すには別のタブをアクティブにする。 */
  readonly active?: boolean
  readonly pinned?: boolean
  readonly muted?: boolean
}

export interface TabMoveOptions {
  readonly index: number | "end"
  /** 省略時は移動元と同じウィンドウ。 */
  readonly windowId?: WindowId
}

export interface TabGroupOptions {
  readonly tabIds: Array.NonEmptyReadonlyArray<TabId>
  /** 省略時は新しいグループを作る。 */
  readonly groupId?: TabGroupId
  /** 新しいグループを作るウィンドウ。省略時は最後にフォーカスされたウィンドウ。 */
  readonly windowId?: WindowId
}

export class Tabs extends Context.Service<
  Tabs,
  {
    query(query: TabQuery): Effect.Effect<ReadonlyArray<BrowserTab>, BrowserApiError>
    get(tabId: TabId): Effect.Effect<BrowserTab, BrowserApiError>
    create(options: TabCreateOptions): Effect.Effect<BrowserTab, BrowserApiError>
    update(tabId: TabId, options: TabUpdateOptions): Effect.Effect<BrowserTab, BrowserApiError>
    /** 先頭から順に閉じる。存在しない ID に当たるとそこで失敗し、それより前のタブは閉じたままになる。 */
    remove(tabIds: ReadonlyArray<TabId>): Effect.Effect<void, BrowserApiError>
    /**
     * タブを `index` から順に並べて置く。
     *
     * @remarks
     * ピン留めされたタブとそうでないタブの境界は越えられず、境界に寄せられる。
     * グループの途中に置いたタブはそのグループに入り、グループから離れたタブはグループを抜ける。
     */
    move(
      tabIds: ReadonlyArray<TabId>,
      options: TabMoveOptions,
    ): Effect.Effect<ReadonlyArray<BrowserTab>, BrowserApiError>
    /** タブをグループにまとめ、そのグループの ID を返す。ピン留めされたタブは外される。 */
    group(options: TabGroupOptions): Effect.Effect<TabGroupId, BrowserApiError>
    ungroup(tabIds: Array.NonEmptyReadonlyArray<TabId>): Effect.Effect<void, BrowserApiError>
    /** アクティブなタブは破棄できず失敗する。 */
    discard(tabId: TabId): Effect.Effect<BrowserTab, BrowserApiError>
  }
>()("katip/platform/browser/Tabs") {
  static readonly layer = Layer.succeed(
    Tabs,
    Tabs.of({
      query: Effect.fn("Tabs.query")(function* (query) {
        const raws = yield* callChrome("tabs.query", () =>
          chrome.tabs.query({
            windowId: query.windowId,
            lastFocusedWindow: query.lastFocusedWindow,
            active: query.active,
            pinned: query.pinned,
            audible: query.audible,
            discarded: query.discarded,
            groupId: Option.map(Option.fromUndefinedOr(query.groupId), tabGroupIdToChrome).pipe(
              Option.getOrUndefined,
            ),
          }),
        )
        return Array.getSomes(raws.map(fromChromeTab))
      }),
      get: Effect.fn("Tabs.get")(function* (tabId) {
        const raw = yield* callChrome("tabs.get", () => chrome.tabs.get(tabId))
        return yield* requirePresent("tabs.get", "the tab has no id")(fromChromeTab(raw))
      }),
      create: Effect.fn("Tabs.create")(function* (options) {
        const raw = yield* callChrome("tabs.create", () =>
          chrome.tabs.create({
            windowId: options.windowId,
            index: options.index,
            url: options.url,
            active: options.active,
            pinned: options.pinned,
            openerTabId: options.openerTabId,
          }),
        )
        return yield* requirePresent("tabs.create", "the tab has no id")(fromChromeTab(raw))
      }),
      update: Effect.fn("Tabs.update")(function* (tabId, options) {
        const raw = yield* callChrome("tabs.update", () =>
          chrome.tabs.update(tabId, {
            url: options.url,
            active: options.active,
            pinned: options.pinned,
            muted: options.muted,
          }),
        )
        return yield* requirePresent(
          "tabs.update",
          "Chrome returned no tab",
        )(Option.flatMap(Option.fromUndefinedOr(raw), fromChromeTab))
      }),
      remove: (tabIds) => callChrome("tabs.remove", () => chrome.tabs.remove([...tabIds])),
      move: Effect.fn("Tabs.move")(function* (tabIds, options) {
        const raws = yield* callChrome("tabs.move", () =>
          chrome.tabs.move([...tabIds], {
            index: options.index === "end" ? -1 : options.index,
            windowId: options.windowId,
          }),
        )
        return Array.getSomes(raws.map(fromChromeTab))
      }),
      group: Effect.fn("Tabs.group")(function* (options) {
        const [first, ...rest] = options.tabIds
        const groupId = yield* callChrome("tabs.group", () =>
          chrome.tabs.group({
            tabIds: [first, ...rest],
            groupId: options.groupId,
            createProperties:
              options.windowId === undefined ? undefined : { windowId: options.windowId },
          }),
        )
        return TabGroupId.make(groupId)
      }),
      ungroup: (tabIds) => {
        const [first, ...rest] = tabIds
        return callChrome("tabs.ungroup", () => chrome.tabs.ungroup([first, ...rest]))
      },
      discard: Effect.fn("Tabs.discard")(function* (tabId) {
        const raw = yield* callChrome("tabs.discard", () => chrome.tabs.discard(tabId))
        return yield* requirePresent(
          "tabs.discard",
          "Chrome did not discard the tab",
        )(Option.flatMap(Option.fromUndefinedOr(raw), fromChromeTab))
      }),
    }),
  )
}
