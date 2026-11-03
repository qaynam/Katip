import { Array, Clock, Context, Effect, Layer, Option, Record, Ref, Scope, Semaphore } from "effect"
import {
  Alarms,
  type BookmarkId,
  Bookmarks,
  type BrowserApiError,
  type BrowserEvent,
  BrowserEvents,
  type BrowserPort,
  type BrowserTab,
  type BrowserTabGroup,
  type BrowserWindow,
  Ports,
  type PortSender,
  SplitViewId,
  Storage,
  type StorageAreaName,
  type TabChanges,
  type TabGroupColor,
  TabGroupId,
  TabGroups,
  TabId,
  Tabs,
  type TabStatus,
  WebSearch,
  type WindowBounds,
  WindowId,
  Windows,
} from "#platform/browser"
import {
  allGroups,
  allTabs,
  DEFAULT_WINDOW_BOUNDS,
  type GroupRecord,
  leastUsedColor,
  type TabRecord,
  toBrowserWindow,
} from "./browsing-state"
import { createTab, emitTabUpdated, NEW_TAB_URL, requireTab, updateTab } from "./browsing-steps"
import { makeFakeAlarms } from "./fake-alarms"
import { type BookmarkSeed, makeFakeBookmarks, type SeededBookmarks } from "./fake-bookmarks"
import { makePortPair } from "./fake-port"
import { makeFakeStorage } from "./fake-storage"
import { makeFakeTabGroups } from "./fake-tab-groups"
import { makeFakeTabs, requireTabSnapshot } from "./fake-tabs"
import { makeFakeWebSearch } from "./fake-web-search"
import { closeWindowWithTabs, makeFakeWindows } from "./fake-windows"
import { type FakeApiName, type FakeWorld, makeFakeWorld, transact } from "./fake-world"

export interface TabSeed {
  /** Defaults to the New Tab page. */
  readonly url?: string
  readonly title?: string
  readonly favIconUrl?: string
  readonly status?: TabStatus
  readonly active?: boolean
  readonly pinned?: boolean
  readonly audible?: boolean
  readonly muted?: boolean
  readonly discarded?: boolean
  /** A key of {@link WindowSeed.groups}. */
  readonly group?: string
  /** Two adjacent tabs with the same key form one split view. */
  readonly split?: string
  /** The index, within the same window, of the tab that opened this one. */
  readonly openerIndex?: number
  /** Defaults to the time of seeding. */
  readonly lastAccessed?: number
}

export interface TabGroupSeed {
  readonly title?: string
  /** Defaults, as in Chrome, to the color least used in the window. */
  readonly color?: TabGroupColor
  readonly collapsed?: boolean
}

/** Keyed by the names {@link TabSeed.group} refers to. */
export interface TabGroupSeeds {
  readonly [key: string]: TabGroupSeed
}

export interface WindowSeed<
  Tabs extends Array.NonEmptyReadonlyArray<TabSeed> = Array.NonEmptyReadonlyArray<TabSeed>,
  Groups extends TabGroupSeeds = TabGroupSeeds,
> {
  /** In tab strip order. Without an `active` tab, the first tab is active. */
  readonly tabs: Tabs
  readonly groups?: Groups
  /** Omitted, the window is focused only when there is no other window. */
  readonly focused?: boolean
  /** Defaults to a 1280×800 window at the top left. */
  readonly bounds?: WindowBounds
}

type SplitKeyOf<Seed> = Seed extends { readonly split: infer Key extends string } ? Key : never

export interface SeededWindow<
  Tabs extends ReadonlyArray<TabSeed> = ReadonlyArray<TabSeed>,
  Groups extends TabGroupSeeds = TabGroupSeeds,
> {
  readonly windowId: WindowId
  /** In the same order as {@link WindowSeed.tabs}. */
  readonly tabIds: { readonly [K in keyof Tabs]: TabId }
  readonly groupIds: { readonly [K in keyof Groups]: TabGroupId }
  /** Keyed by {@link TabSeed.split}. */
  readonly splitViewIds: { readonly [K in SplitKeyOf<Tabs[number]>]: SplitViewId }
}

/**
 * A change made by the page itself. Only fields whose values change go into the `changes` of
 * `TabUpdated`.
 */
export interface PageUpdate {
  readonly url?: string
  readonly title?: string
  readonly favIconUrl?: string
  readonly status?: TabStatus
  readonly audible?: boolean
}

export interface BrowsingSnapshot {
  readonly windows: ReadonlyArray<BrowserWindow>
  /** In window creation order, and by index within each window. */
  readonly tabs: ReadonlyArray<BrowserTab>
  readonly groups: ReadonlyArray<BrowserTabGroup>
}

const splitKeysOf = (seed: WindowSeed): ReadonlyArray<string> =>
  Array.dedupe(seed.tabs.flatMap((tab) => (tab.split === undefined ? [] : [tab.split])))

const splitProblems = (seed: WindowSeed, key: string): ReadonlyArray<string> => {
  const members = seed.tabs.flatMap((tab, index) => (tab.split === key ? [{ tab, index }] : []))
  const [first, second] = members
  if (first === undefined || second === undefined || members.length > 2) {
    return [`split "${key}" does not have exactly two tabs`]
  }
  return [
    ...(second.index - first.index === 1 ? [] : [`split "${key}" tabs are not adjacent`]),
    ...((first.tab.pinned ?? false) === (second.tab.pinned ?? false)
      ? []
      : [`split "${key}" tabs differ in pinning`]),
    ...(first.tab.group === second.tab.group ? [] : [`split "${key}" tabs differ in group`]),
  ]
}

const seedProblems = (seed: WindowSeed): ReadonlyArray<string> => {
  const groupKeys = Object.keys(seed.groups ?? {})
  const membersOf = (key: string) =>
    seed.tabs.flatMap((tab, index) => (tab.group === key ? [index] : []))
  return [
    ...(seed.tabs.some(
      (tab, index) => tab.pinned && seed.tabs.slice(0, index).some((before) => !before.pinned),
    )
      ? ["pinned tabs must come before unpinned tabs"]
      : []),
    ...(seed.tabs.filter((tab) => tab.active).length > 1 ? ["at most one tab can be active"] : []),
    ...seed.tabs.flatMap((tab, index) => [
      ...(tab.group !== undefined && !groupKeys.includes(tab.group)
        ? [`tab ${index} refers to group "${tab.group}", which is not in groups`]
        : []),
      ...(tab.group !== undefined && tab.pinned
        ? [`tab ${index} cannot be both pinned and grouped`]
        : []),
      ...(tab.openerIndex !== undefined &&
      (tab.openerIndex === index || tab.openerIndex < 0 || tab.openerIndex >= seed.tabs.length)
        ? [`tab ${index} has an openerIndex out of range`]
        : []),
    ]),
    ...groupKeys.flatMap((key) => {
      const members = membersOf(key)
      const contiguous = Option.getOrElse(
        Option.zipWith(Array.head(members), Array.last(members), (first, last) => {
          return last - first + 1 === members.length
        }),
        () => true,
      )
      return [
        ...(members.length === 0 ? [`group "${key}" has no tabs`] : []),
        ...(contiguous ? [] : [`group "${key}" tabs are not contiguous`]),
      ]
    }),
    ...splitKeysOf(seed).flatMap((key) => splitProblems(seed, key)),
  ]
}

const seedWindowInto = <
  const Tabs extends Array.NonEmptyReadonlyArray<TabSeed>,
  const Groups extends TabGroupSeeds,
>(
  world: FakeWorld,
  seed: WindowSeed<Tabs, Groups>,
) =>
  Semaphore.withPermits(
    world.lock,
    1,
  )(
    Effect.gen(function* () {
      const problems = seedProblems(seed)
      if (problems.length > 0) {
        return yield* Effect.die(new Error(`seedWindow: ${problems.join(" / ")}`))
      }
      const now = yield* Clock.currentTimeMillis
      const state = yield* Ref.get(world.browsing)
      const windowId = WindowId.make(state.lastIssuedId + 1)
      const tabIds = Array.map(seed.tabs, (_, index) => TabId.make(state.lastIssuedId + 2 + index))
      const groupEntries = Object.entries(seed.groups ?? {}).map(
        ([key, groupSeed], index) =>
          [
            key,
            groupSeed,
            TabGroupId.make(state.lastIssuedId + 2 + seed.tabs.length + index),
          ] as const,
      )
      const groupIds = Record.fromEntries(groupEntries.map(([key, , id]) => [key, id] as const))
      const splitKeys = splitKeysOf(seed)
      const splitViewIds = Record.fromEntries(
        splitKeys.map(
          (key, index) =>
            [
              key,
              SplitViewId.make(
                state.lastIssuedId + 2 + seed.tabs.length + groupEntries.length + index,
              ),
            ] as const,
        ),
      )
      const groups = groupEntries.reduce<ReadonlyArray<GroupRecord>>(
        (built, [, groupSeed, id]) => [
          ...built,
          {
            id,
            title: Option.filter(
              Option.fromUndefinedOr(groupSeed.title),
              (title) => title.length > 0,
            ),
            color: groupSeed.color ?? leastUsedColor(built.map(({ color }) => color)),
            collapsed: groupSeed.collapsed ?? false,
          },
        ],
        [],
      )
      const tabs = Array.zip(seed.tabs, tabIds).map(([tabSeed, id]): TabRecord => ({
        id,
        url: Option.some(tabSeed.url ?? NEW_TAB_URL),
        title: Option.fromUndefinedOr(tabSeed.title),
        favIconUrl: Option.fromUndefinedOr(tabSeed.favIconUrl),
        status: tabSeed.status ?? "complete",
        pinned: tabSeed.pinned ?? false,
        audible: tabSeed.audible ?? false,
        muted: tabSeed.muted ?? false,
        discarded: tabSeed.discarded ?? false,
        openerTabId: Option.flatMap(Option.fromUndefinedOr(tabSeed.openerIndex), (index) =>
          Array.get(tabIds, index),
        ),
        groupId: Option.flatMap(Option.fromUndefinedOr(tabSeed.group), (key) =>
          Record.get(groupIds, key),
        ),
        splitViewId: Option.flatMap(Option.fromUndefinedOr(tabSeed.split), (key) =>
          Record.get(splitViewIds, key),
        ),
        lastAccessed: tabSeed.lastAccessed ?? now,
      }))
      const activeIndex = Math.max(
        seed.tabs.findIndex((tab) => tab.active === true),
        0,
      )
      const focused = seed.focused ?? state.focusOrder.length === 0
      yield* Ref.set(world.browsing, {
        windows: [
          ...state.windows,
          {
            id: windowId,
            type: "normal",
            bounds: seed.bounds ?? DEFAULT_WINDOW_BOUNDS,
            tabs,
            activeTabId: Array.get(tabIds, activeIndex),
          },
        ],
        groups: [...state.groups, ...groups],
        focusOrder: focused ? [windowId, ...state.focusOrder] : [...state.focusOrder, windowId],
        lastIssuedId:
          state.lastIssuedId + 1 + seed.tabs.length + groupEntries.length + splitKeys.length,
      })
      // Cast because map and fromEntries drop tuple lengths and keys from the types; restore the
      // seed's shape
      return {
        windowId,
        tabIds: tabIds as SeededWindow<Tabs, Groups>["tabIds"],
        groupIds: groupIds as SeededWindow<Tabs, Groups>["groupIds"],
        splitViewIds: splitViewIds as SeededWindow<Tabs, Groups>["splitViewIds"],
      }
    }),
  )

const applyPageChanges = (tab: TabRecord, changes: TabChanges): TabRecord => ({
  ...tab,
  url: Option.orElse(Option.fromUndefinedOr(changes.url), () => tab.url),
  title: Option.orElse(Option.fromUndefinedOr(changes.title), () => tab.title),
  favIconUrl: Option.orElse(Option.fromUndefinedOr(changes.favIconUrl), () => tab.favIconUrl),
  status: changes.status ?? tab.status,
  audible: changes.audible ?? tab.audible,
})

const pageChanges = (tab: TabRecord, update: PageUpdate): TabChanges => ({
  ...(update.url !== undefined && !Option.contains(tab.url, update.url) && { url: update.url }),
  ...(update.title !== undefined &&
    !Option.contains(tab.title, update.title) && { title: update.title }),
  ...(update.favIconUrl !== undefined &&
    !Option.contains(tab.favIconUrl, update.favIconUrl) && { favIconUrl: update.favIconUrl }),
  ...(update.status !== undefined && update.status !== tab.status && { status: update.status }),
  ...(update.audible !== undefined &&
    update.audible !== tab.audible && { audible: update.audible }),
})

export interface FakeBrowserOptions {
  /**
   * Defaults to `true`. `false` plays Chrome without the API to create and dissolve split views
   * (before 155).
   */
  readonly supportsSplitView?: boolean
}

type FakeBrowserServices =
  | FakeBrowser
  | Tabs
  | TabGroups
  | Windows
  | Bookmarks
  | Storage
  | Alarms
  | BrowserEvents
  | Ports
  | WebSearch

const extensionPageSender: PortSender = {
  external: false,
  url: Option.none(),
  origin: Option.none(),
  tabId: Option.none(),
}

/**
 * A handle for tests to seed and observe browser state and to play what users and pages do.
 * `FakeBrowser.layer` provides this and fakes of every Chrome API service, all sharing one state.
 * `FakeBrowser.layerWith` provides the same with Chrome version differences specified.
 */
export class FakeBrowser extends Context.Service<
  FakeBrowser,
  {
    /** Places a window with its tabs and groups without firing events; dies on a bad seed. */
    seedWindow<
      const Tabs extends Array.NonEmptyReadonlyArray<TabSeed>,
      const Groups extends TabGroupSeeds = TabGroupSeeds,
    >(
      seed: WindowSeed<Tabs, Groups>,
    ): Effect.Effect<SeededWindow<Tabs, Groups>>
    /** Places bookmarks without firing events and returns the nodes with their children. */
    seedBookmarks<const Seeds extends ReadonlyArray<BookmarkSeed>>(
      parentId: BookmarkId,
      seeds: Seeds,
    ): Effect.Effect<SeededBookmarks<Seeds>>
    /** Stores values without emitting changes. */
    seedStorage(
      area: StorageAreaName,
      entries: Record.ReadonlyRecord<string, unknown>,
    ): Effect.Effect<void>
    readonly snapshot: Effect.Effect<BrowsingSnapshot>
    /**
     * Emits an event without changing the state, for events the fake never causes itself, such as
     * commands and installs.
     */
    emit(event: BrowserEvent): Effect.Effect<void>
    /** Takes the events emitted since the last take, in the order emitted. */
    readonly takeEmittedEvents: Effect.Effect<ReadonlyArray<BrowserEvent>>
    /** Plays the user closing a window; its tabs close with `isWindowClosing: true`. */
    closeWindow(windowId: WindowId): Effect.Effect<void, BrowserApiError>
    /** Plays a change made by the page, such as loading or a new title. */
    updatePage(tabId: TabId, update: PageUpdate): Effect.Effect<BrowserTab, BrowserApiError>
    /**
     * Plays the user opening a link of the tab in a new tab, in the background unless `active`. As
     * in Chrome, the tab opens after that tab and the tabs it already opened right next to it, is
     * created with no URL, and then starts loading `url`.
     */
    openLink(
      fromTabId: TabId,
      url: string,
      options?: { readonly active?: boolean },
    ): Effect.Effect<TabId, BrowserApiError>
    fireAlarm(name: string): Effect.Effect<void, BrowserApiError>
    /**
     * Makes the next call to `api` do nothing and fail with {@link BrowserApiError}. Calling this
     * several times fails that many calls in a row.
     *
     * @param cause - The value to put in `BrowserApiError.cause`.
     */
    failNext(api: FakeApiName, cause?: unknown): Effect.Effect<void>
    /**
     * Returns the connecting side's Port and emits the accepting side's Port on
     * `BrowserEvents.connections`. Closing the scope disconnects.
     */
    connect(name: string, sender?: PortSender): Effect.Effect<BrowserPort, never, Scope.Scope>
  }
>()("katip/platform/browser-testing/FakeBrowser") {
  static readonly layerWith = (options: FakeBrowserOptions): Layer.Layer<FakeBrowserServices> =>
    Layer.effectContext(
      Effect.gen(function* () {
        const world = yield* makeFakeWorld
        const bookmarks = yield* makeFakeBookmarks(world)
        const storage = yield* makeFakeStorage(world)
        const alarms = yield* makeFakeAlarms(world)

        const connect = (name: string, sender: PortSender = extensionPageSender) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const { client, server } = makePortPair(name, sender)
              world.connections.push(server)
              return client
            }),
            (client) => client.disconnect,
          )

        const fakeBrowser = FakeBrowser.of({
          seedWindow: (seed) => seedWindowInto(world, seed),
          seedBookmarks: bookmarks.seed,
          seedStorage: storage.seed,
          snapshot: Effect.map(Ref.get(world.browsing), (state) => ({
            windows: state.windows.map((window) => toBrowserWindow(state, window)),
            tabs: allTabs(state),
            groups: allGroups(state),
          })),
          emit: (event) => world.publish([event]),
          takeEmittedEvents: world.takeEmitted,
          closeWindow: (windowId) =>
            transact(world, "windows.remove", (tx) => closeWindowWithTabs(tx, windowId)),
          updatePage: (tabId, update) =>
            transact(
              world,
              "tabs.onUpdated",
              Effect.fnUntraced(function* (tx) {
                const { tab } = yield* requireTab(tx, tabId)
                const changes = pageChanges(tab, update)
                if (Object.keys(changes).length > 0) {
                  yield* updateTab(tx, tabId, (record) => applyPageChanges(record, changes))
                  yield* emitTabUpdated(tx, tabId, changes)
                }
                return yield* requireTabSnapshot(tx, tabId)
              }),
            ),
          openLink: (fromTabId, url, options = {}) =>
            transact(
              world,
              "tabs.onCreated",
              Effect.fnUntraced(function* (tx) {
                const opener = yield* requireTab(tx, fromTabId)
                const openedBefore = Array.takeWhile(
                  opener.window.tabs.slice(opener.index + 1),
                  (tab) => Option.contains(tab.openerTabId, fromTabId),
                )
                const tabId = yield* createTab(tx, {
                  windowId: opener.window.id,
                  index: opener.index + 1 + openedBefore.length,
                  url: "",
                  active: options.active ?? false,
                  pinned: false,
                  openerTabId: Option.some(fromTabId),
                })
                const changes: TabChanges = { url, status: "loading" }
                yield* updateTab(tx, tabId, (record) => applyPageChanges(record, changes))
                yield* emitTabUpdated(tx, tabId, changes)
                return tabId
              }),
            ),
          fireAlarm: alarms.fire,
          failNext: (api, cause = new Error(`${api} failed (injected by FakeBrowser)`)) =>
            Ref.update(world.failures, (pending) => [...pending, { api, cause }]),
          connect,
        })

        return Context.make(FakeBrowser, fakeBrowser).pipe(
          Context.add(
            Tabs,
            makeFakeTabs(world, { supportsSplitView: options.supportsSplitView ?? true }),
          ),
          Context.add(TabGroups, makeFakeTabGroups(world)),
          Context.add(Windows, makeFakeWindows(world)),
          Context.add(Bookmarks, bookmarks.service),
          Context.add(Storage, storage.service),
          Context.add(Alarms, alarms.service),
          Context.add(WebSearch, makeFakeWebSearch(world)),
          Context.add(
            BrowserEvents,
            BrowserEvents.of({
              events: world.events.stream,
              connections: world.connections.stream,
            }),
          ),
          Context.add(Ports, Ports.of({ connect: (name) => connect(name) })),
        )
      }),
    )

  static readonly layer: Layer.Layer<FakeBrowserServices> = FakeBrowser.layerWith({})
}
