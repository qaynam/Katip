import { Array, Context, Effect, Layer, Option } from "effect"
import { BrowserApiError, callChrome, requirePresent } from "./browser-api-error"
import { tabGroupIdToChrome } from "./chrome-values"
import { SplitViewId, TabGroupId, type TabId, type WindowId } from "./ids"
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
  /**
   * Splits the new tab with this tab. Without `index`, the new tab opens right of this tab.
   * When this tab is in a group, the new tab joins the group before it is split.
   *
   * @remarks
   * Fails when this tab is already split, when `windowId` is not this tab's window, when `index`
   * is not next to this tab, or when {@link Tabs.supportsSplitView} is `false`.
   */
  readonly splitWithTabId?: TabId
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
    /**
     * Opens the same page in a new active tab right after the original.
     *
     * @remarks
     * The duplicate's `openerTabId` is the tab that was active when duplicating, not the original.
     * When the original is in a split view, the split is dissolved first.
     */
    duplicate(tabId: TabId): Effect.Effect<BrowserTab, BrowserApiError>
    /**
     * Closes the tabs in order. Fails at the first missing ID; tabs before it stay closed.
     *
     * @remarks
     * Before a tab is removed, its split view, pinning and group are released, and the events for
     * those changes arrive before `TabRemoved`.
     */
    remove(tabIds: ReadonlyArray<TabId>): Effect.Effect<void, BrowserApiError>
    /**
     * Places the tabs one after another from `index` and returns each tab as of its own move.
     *
     * @remarks
     * Each tab goes right after where the previous one actually landed.
     * Tabs cannot cross the boundary between pinned and unpinned tabs; they stop at it.
     * A tab placed inside a group joins it, and a tab moved away from its group leaves it.
     * Moving a tab of a split view dissolves the split, even when both tabs move together, and so
     * does moving another tab between them. A tab that stays where it is keeps its split.
     * Moving to another window releases the pinning and the group first.
     */
    move(
      tabIds: ReadonlyArray<TabId>,
      options: TabMoveOptions,
    ): Effect.Effect<ReadonlyArray<BrowserTab>, BrowserApiError>
    /**
     * Groups the tabs and returns the group ID. Pinned tabs are unpinned.
     * Passing one tab of a split view groups its partner too and keeps the split.
     */
    group(options: TabGroupOptions): Effect.Effect<TabGroupId, BrowserApiError>
    /** Passing one tab of a split view ungroups its partner too and keeps the split. */
    ungroup(tabIds: Array.NonEmptyReadonlyArray<TabId>): Effect.Effect<void, BrowserApiError>
    /**
     * Returns the discarded tab under its new ID. Fails for the active tab.
     *
     * @remarks
     * The old ID becomes invalid and `TabReplaced` arrives. The split view and the group carry over
     * to the replacement.
     */
    discard(tabId: TabId): Effect.Effect<BrowserTab, BrowserApiError>
    /**
     * 分割ビューを作る・解く API（Chrome 155 以降）があるか。
     * `false` でも、ユーザーが作った分割ビューは `BrowserTab.splitViewId` で読める（Chrome 140 以降）。
     */
    readonly supportsSplitView: boolean
    /**
     * 隣り合う 2 つのタブを分割ビューにする。
     *
     * @remarks
     * どちらも分割されておらず、ウィンドウ・ピン留め・グループが揃っていなければ失敗する。
     * `supportsSplitView` が `false` なら失敗する。
     */
    createSplit(tabIds: readonly [TabId, TabId]): Effect.Effect<SplitViewId, BrowserApiError>
    /** `supportsSplitView` が `false` なら失敗する。 */
    unsplit(splitViewId: SplitViewId): Effect.Effect<void, BrowserApiError>
  }
>()("katip/platform/browser/Tabs") {
  // Layer.succeed だと import した時点で chrome.tabs を読み、chrome の無いテストが import だけで落ちる
  static readonly layer = Layer.sync(Tabs, () => {
    const supportsSplitView = typeof chrome.tabs.createSplit === "function"
    const requireSplitViewApi = (api: string) =>
      supportsSplitView ? Effect.void : Effect.fail(splitViewUnsupported(api))
    return Tabs.of({
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
        if (options.splitWithTabId !== undefined) yield* requireSplitViewApi("tabs.create")
        const raw = yield* callChrome("tabs.create", () =>
          chrome.tabs.create({
            windowId: options.windowId,
            index: options.index,
            url: options.url,
            active: options.active,
            pinned: options.pinned,
            openerTabId: options.openerTabId,
            // 分割ビューの無い Chrome は、値が undefined でもこの名前の項目があるだけで呼び出しを拒む
            ...(options.splitWithTabId !== undefined && { splitWithTabId: options.splitWithTabId }),
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
      duplicate: Effect.fn("Tabs.duplicate")(function* (tabId) {
        const raw = yield* callChrome("tabs.duplicate", () => chrome.tabs.duplicate(tabId))
        return yield* requirePresent(
          "tabs.duplicate",
          "Chrome returned no tab",
        )(Option.flatMap(Option.fromUndefinedOr(raw), fromChromeTab))
      }),
      remove: (tabIds) => callChrome("tabs.remove", () => chrome.tabs.remove([...tabIds])),
      move: Effect.fn("Tabs.move")(function* (tabIds, options) {
        // 型定義は配列を返すとしているが、Chrome は 1 つだけ動かしたときタブをそのまま返す
        const moved: chrome.tabs.Tab | ReadonlyArray<chrome.tabs.Tab> = yield* callChrome(
          "tabs.move",
          () =>
            chrome.tabs.move([...tabIds], {
              index: options.index === "end" ? -1 : options.index,
              windowId: options.windowId,
            }),
        )
        return Array.getSomes(Array.ensure(moved).map(fromChromeTab))
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
      supportsSplitView,
      createSplit: Effect.fn("Tabs.createSplit")(function* (tabIds) {
        yield* requireSplitViewApi("tabs.createSplit")
        const splitViewId = yield* callChrome("tabs.createSplit", () =>
          chrome.tabs.createSplit([...tabIds]),
        )
        return SplitViewId.make(splitViewId)
      }),
      unsplit: Effect.fn("Tabs.unsplit")(function* (splitViewId) {
        yield* requireSplitViewApi("tabs.unsplit")
        yield* callChrome("tabs.unsplit", () => chrome.tabs.unsplit(splitViewId))
      }),
    })
  })
}

const splitViewUnsupported = (api: string) =>
  new BrowserApiError({ api, cause: new Error("Split View API requires Chrome 155 or later") })
