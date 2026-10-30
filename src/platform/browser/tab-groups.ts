import { Context, Effect, Layer, Option } from "effect"
import { type BrowserApiError, callChrome, requirePresent } from "./browser-api-error"
import type { TabGroupId, WindowId } from "./ids"
import { type BrowserTabGroup, fromChromeTabGroup, type TabGroupColor } from "./tab-group"

export interface TabGroupQuery {
  readonly windowId?: WindowId
  readonly collapsed?: boolean
  readonly color?: TabGroupColor
  readonly title?: string
}

export interface TabGroupUpdateOptions {
  /** 空文字で無題に戻す。 */
  readonly title?: string
  readonly color?: TabGroupColor
  readonly collapsed?: boolean
}

export interface TabGroupMoveOptions {
  /** 移動後にグループの先頭のタブが来る位置。 */
  readonly index: number | "end"
  readonly windowId?: WindowId
}

export class TabGroups extends Context.Service<
  TabGroups,
  {
    query(query: TabGroupQuery): Effect.Effect<ReadonlyArray<BrowserTabGroup>, BrowserApiError>
    get(groupId: TabGroupId): Effect.Effect<BrowserTabGroup, BrowserApiError>
    /** アクティブなタブを含むグループを折りたたむと、グループの外のタブがアクティブになる。 */
    update(
      groupId: TabGroupId,
      options: TabGroupUpdateOptions,
    ): Effect.Effect<BrowserTabGroup, BrowserApiError>
    /** ピン留めされたタブの間や別のグループの途中へは動かせず失敗する。 */
    move(
      groupId: TabGroupId,
      options: TabGroupMoveOptions,
    ): Effect.Effect<BrowserTabGroup, BrowserApiError>
  }
>()("katip/platform/browser/TabGroups") {
  static readonly layer = Layer.succeed(
    TabGroups,
    TabGroups.of({
      query: Effect.fn("TabGroups.query")(function* (query) {
        const raws = yield* callChrome("tabGroups.query", () =>
          chrome.tabGroups.query({
            windowId: query.windowId,
            collapsed: query.collapsed,
            color: query.color,
            title: query.title,
          }),
        )
        return raws.map(fromChromeTabGroup)
      }),
      get: Effect.fn("TabGroups.get")(function* (groupId) {
        const raw = yield* callChrome("tabGroups.get", () => chrome.tabGroups.get(groupId))
        return fromChromeTabGroup(raw)
      }),
      update: Effect.fn("TabGroups.update")(function* (groupId, options) {
        const raw = yield* callChrome("tabGroups.update", () =>
          chrome.tabGroups.update(groupId, {
            ...(options.title !== undefined && { title: options.title }),
            ...(options.color !== undefined && { color: options.color }),
            ...(options.collapsed !== undefined && { collapsed: options.collapsed }),
          }),
        )
        return yield* requirePresent(
          "tabGroups.update",
          "Chrome returned no group",
        )(Option.map(Option.fromUndefinedOr(raw), fromChromeTabGroup))
      }),
      move: Effect.fn("TabGroups.move")(function* (groupId, options) {
        const raw = yield* callChrome("tabGroups.move", () =>
          chrome.tabGroups.move(groupId, {
            index: options.index === "end" ? -1 : options.index,
            ...(options.windowId !== undefined && { windowId: options.windowId }),
          }),
        )
        return yield* requirePresent(
          "tabGroups.move",
          "Chrome returned no group",
        )(Option.map(Option.fromUndefinedOr(raw), fromChromeTabGroup))
      }),
    }),
  )
}
