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
  /** `None` matches tabs in no group. */
  readonly groupId?: Option.Option<TabGroupId>
}

export interface TabCreateOptions {
  /** Defaults to the last focused window. */
  readonly windowId?: WindowId
  readonly index?: number
  readonly url?: string
  /** Defaults to `true`. */
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
  /** `false` is ignored; to deactivate a tab, activate another one. */
  readonly active?: boolean
  readonly pinned?: boolean
  readonly muted?: boolean
}

export interface TabMoveOptions {
  readonly index: number | "end"
  /** Defaults to the tab's current window. */
  readonly windowId?: WindowId
}

export interface TabGroupOptions {
  readonly tabIds: Array.NonEmptyReadonlyArray<TabId>
  /** Omitted, a new group is created. */
  readonly groupId?: TabGroupId
  /** The window to create a new group in. Defaults to the last focused window. */
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
     * Whether the API to create and dissolve split views exists (Chrome 155 and later).
     * Even when `false`, split views the user made are readable through `BrowserTab.splitViewId`
     * (Chrome 140 and later).
     */
    readonly supportsSplitView: boolean
    /**
     * Makes a split view of two adjacent tabs.
     *
     * @remarks
     * Fails unless neither tab is split and both share the same window, pinning and group.
     * Fails when `supportsSplitView` is `false`.
     */
    createSplit(tabIds: readonly [TabId, TabId]): Effect.Effect<SplitViewId, BrowserApiError>
    /** Fails when `supportsSplitView` is `false`. */
    unsplit(splitViewId: SplitViewId): Effect.Effect<void, BrowserApiError>
  }
>()("katip/platform/browser/Tabs") {
  // Not Layer.succeed: that reads chrome.tabs on import, which breaks tests without `chrome` just
  // by importing this module
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
            // Spread rather than set to undefined: Chrome without split views rejects the call if
            // the key is present at all
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
        // The type definitions say it returns an array, but Chrome returns the bare tab when moving
        // just one
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
