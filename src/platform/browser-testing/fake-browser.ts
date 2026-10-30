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
import { emitTabUpdated, NEW_TAB_URL, requireTab, updateTab } from "./browsing-steps"
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
  /** 省略時は新しいタブのページ。 */
  readonly url?: string
  readonly title?: string
  readonly favIconUrl?: string
  readonly status?: TabStatus
  readonly active?: boolean
  readonly pinned?: boolean
  readonly audible?: boolean
  readonly muted?: boolean
  readonly discarded?: boolean
  /** {@link WindowSeed.groups} のキー。 */
  readonly group?: string
  /** 同じキーを持つ隣り合った 2 つのタブが 1 つの分割ビューになる。 */
  readonly split?: string
  /** このタブを開いたタブの、同じウィンドウの中での位置。 */
  readonly openerIndex?: number
  /** 省略時は仕込んだ時刻。 */
  readonly lastAccessed?: number
}

export interface TabGroupSeed {
  readonly title?: string
  /** 省略時は Chrome と同じく、そのウィンドウで使われている数が少ない色。 */
  readonly color?: TabGroupColor
  readonly collapsed?: boolean
}

/** キーは {@link TabSeed.group} から参照する名前。 */
export interface TabGroupSeeds {
  readonly [key: string]: TabGroupSeed
}

export interface WindowSeed<
  Tabs extends Array.NonEmptyReadonlyArray<TabSeed> = Array.NonEmptyReadonlyArray<TabSeed>,
  Groups extends TabGroupSeeds = TabGroupSeeds,
> {
  /** 並びがそのままタブストリップの順。`active` が無ければ先頭のタブがアクティブになる。 */
  readonly tabs: Tabs
  readonly groups?: Groups
  /** 省略時は、ほかにウィンドウが無いときだけフォーカスされる。 */
  readonly focused?: boolean
  /** 省略時は左上に置いた 1280×800 のウィンドウ。 */
  readonly bounds?: WindowBounds
}

type SplitKeyOf<Seed> = Seed extends { readonly split: infer Key extends string } ? Key : never

export interface SeededWindow<
  Tabs extends ReadonlyArray<TabSeed> = ReadonlyArray<TabSeed>,
  Groups extends TabGroupSeeds = TabGroupSeeds,
> {
  readonly windowId: WindowId
  /** {@link WindowSeed.tabs} と同じ順。 */
  readonly tabIds: { readonly [K in keyof Tabs]: TabId }
  readonly groupIds: { readonly [K in keyof Groups]: TabGroupId }
  /** キーは {@link TabSeed.split}。 */
  readonly splitViewIds: { readonly [K in SplitKeyOf<Tabs[number]>]: SplitViewId }
}

/** ページの側で起きる変化。値が変わった項目だけが `TabUpdated` の `changes` に入る。 */
export interface PageUpdate {
  readonly url?: string
  readonly title?: string
  readonly favIconUrl?: string
  readonly status?: TabStatus
  readonly audible?: boolean
}

export interface BrowsingSnapshot {
  readonly windows: ReadonlyArray<BrowserWindow>
  /** ウィンドウの作成順、ウィンドウの中では index 順。 */
  readonly tabs: ReadonlyArray<BrowserTab>
  readonly groups: ReadonlyArray<BrowserTabGroup>
}

const splitKeysOf = (seed: WindowSeed): ReadonlyArray<string> =>
  Array.dedupe(seed.tabs.flatMap((tab) => (tab.split === undefined ? [] : [tab.split])))

const splitProblems = (seed: WindowSeed, key: string): ReadonlyArray<string> => {
  const members = seed.tabs.flatMap((tab, index) => (tab.split === key ? [{ tab, index }] : []))
  const [first, second] = members
  if (first === undefined || second === undefined || members.length > 2) {
    return [`分割 "${key}" のタブが 2 つでない`]
  }
  return [
    ...(second.index - first.index === 1 ? [] : [`分割 "${key}" のタブが隣り合っていない`]),
    ...((first.tab.pinned ?? false) === (second.tab.pinned ?? false)
      ? []
      : [`分割 "${key}" のタブのピン留めが揃っていない`]),
    ...(first.tab.group === second.tab.group
      ? []
      : [`分割 "${key}" のタブのグループが揃っていない`]),
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
      ? ["ピン留めしたタブはピン留めしていないタブより前に置く"]
      : []),
    ...(seed.tabs.filter((tab) => tab.active).length > 1 ? ["アクティブなタブは 1 つまで"] : []),
    ...seed.tabs.flatMap((tab, index) => [
      ...(tab.group !== undefined && !groupKeys.includes(tab.group)
        ? [`タブ ${index} のグループ "${tab.group}" が groups に無い`]
        : []),
      ...(tab.group !== undefined && tab.pinned
        ? [`タブ ${index} はピン留めとグループを両立できない`]
        : []),
      ...(tab.openerIndex !== undefined &&
      (tab.openerIndex === index || tab.openerIndex < 0 || tab.openerIndex >= seed.tabs.length)
        ? [`タブ ${index} の openerIndex が範囲外`]
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
        ...(members.length === 0 ? [`グループ "${key}" にタブが無い`] : []),
        ...(contiguous ? [] : [`グループ "${key}" のタブが連続していない`]),
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
      // map や fromEntries は tuple の長さやキーを型に残さないので、仕込みの形に合わせて戻す
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
  /** 省略時は `true`。`false` なら分割ビューを作る・解く API の無い Chrome（155 未満）を再現する。 */
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
 * テストからブラウザの状態を仕込み、観察し、ユーザーやページの側の操作を起こすハンドル。
 * `FakeBrowser.layer` は、これと Chrome API の全サービスの fake を、状態を共有させて提供する。
 * `FakeBrowser.layerWith` は Chrome のバージョンの違いを指定して同じものを提供する。
 */
export class FakeBrowser extends Context.Service<
  FakeBrowser,
  {
    /** イベントを発火せずにウィンドウとタブとグループを置く。仕込みが矛盾していれば die する。 */
    seedWindow<
      const Tabs extends Array.NonEmptyReadonlyArray<TabSeed>,
      const Groups extends TabGroupSeeds = TabGroupSeeds,
    >(
      seed: WindowSeed<Tabs, Groups>,
    ): Effect.Effect<SeededWindow<Tabs, Groups>>
    /** イベントを発火せずにブックマークを置き、置いたノードを子ごと返す。 */
    seedBookmarks<const Seeds extends ReadonlyArray<BookmarkSeed>>(
      parentId: BookmarkId,
      seeds: Seeds,
    ): Effect.Effect<SeededBookmarks<Seeds>>
    /** 変更を通知せずに storage へ値を入れる。 */
    seedStorage(
      area: StorageAreaName,
      entries: Record.ReadonlyRecord<string, unknown>,
    ): Effect.Effect<void>
    readonly snapshot: Effect.Effect<BrowsingSnapshot>
    /** 状態を変えずにイベントだけを発火する。コマンドやインストールなど、fake が起こさないイベント用。 */
    emit(event: BrowserEvent): Effect.Effect<void>
    /** 前回取り出してから発火したイベントを、発火した順に取り出す。 */
    readonly takeEmittedEvents: Effect.Effect<ReadonlyArray<BrowserEvent>>
    /** ユーザーがウィンドウを閉じる。タブは `isWindowClosing: true` で閉じる。 */
    closeWindow(windowId: WindowId): Effect.Effect<void, BrowserApiError>
    /** ページの読み込みやタイトルの変化など、ページの側で起きる変化を起こす。 */
    updatePage(tabId: TabId, update: PageUpdate): Effect.Effect<BrowserTab, BrowserApiError>
    fireAlarm(name: string): Effect.Effect<void, BrowserApiError>
    /**
     * 次に `api` を呼んだとき、何もせずに {@link BrowserApiError} で失敗させる。
     * 何度も呼ぶと、その回数だけ続けて失敗する。
     *
     * @param cause - 失敗の原因として `BrowserApiError.cause` に入れる値。
     */
    failNext(api: FakeApiName, cause?: unknown): Effect.Effect<void>
    /**
     * 接続する側の Port を返し、受け付ける側の Port を `BrowserEvents.connections` に流す。
     * スコープを閉じると切断する。
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
