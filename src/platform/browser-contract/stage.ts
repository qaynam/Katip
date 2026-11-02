import { Array, Effect, Equal, Match, Option, type Scope } from "effect"
import {
  type BookmarkId,
  type BookmarkNode,
  Bookmarks,
  type BrowserApiError,
  type BrowserEvent,
  type BrowserTab,
  type BrowserTabGroup,
  type SplitViewId,
  type TabChanges,
  type TabGroupId,
  type TabGroups,
  type TabId,
  Tabs,
  type WindowId,
  Windows,
} from "#platform/browser"
import { ContractRig } from "./contract-rig"

export type Json =
  string | number | boolean | null | ReadonlyArray<Json> | { readonly [key: string]: Json }

export type Observation = { readonly [key: string]: Json }

/** 場面が使ってよいブラウザのサービス。 */
export type ContractServices = Tabs | TabGroups | Windows | Bookmarks

/** 読み込みが一瞬で終わり、ネットワークにも出ない、名前ごとに違うページ。 */
export const pageUrl = (name: string) => `about:blank#${name}`

export const bookmarkUrl = (title: string) => `https://example.com/${title}`

/** `url` が決まる前のタブは `pendingUrl` に開こうとしている URL を持つ。 */
export const urlOf = (tab: BrowserTab) =>
  Option.getOrElse(
    Option.orElse(tab.url, () => tab.pendingUrl),
    () => "",
  )

export type BookmarkSeed =
  string | { readonly folder: string; readonly children: ReadonlyArray<BookmarkSeed> }

export interface OpenedWindow<Labels extends ReadonlyArray<string>> {
  readonly windowId: WindowId
  readonly tabs: { readonly [K in keyof Labels]: TabId }
}

export interface OpenedBookmarks {
  readonly rootId: BookmarkId
  /** 仕込んだノードの ID。仕込んでいないタイトルを渡すと例外を投げる。 */
  readonly id: (title: string) => BookmarkId
}

export interface ObservationTarget {
  readonly windows?: ReadonlyArray<WindowId>
  /** 操作の戻り値を表す。イベントを表した後に呼ぶ。 */
  readonly returned?: () => Json
  /** このフォルダの子を `tree` に入れる。 */
  readonly bookmarks?: BookmarkId
}

/** 場面ごとに 1 つ作られ、作ったタブやブックマークに名前を付けて、観察した結果を名前で表す。 */
export interface Stage {
  /**
   * フォーカスしないウィンドウを開き、`labels` の順にタブを並べる。最初のタブがアクティブになる。
   * 開くまでのイベントは観察に含めず、場面が終わるとウィンドウを閉じる。
   */
  openWindow<const Labels extends Array.NonEmptyReadonlyArray<string>>(
    labels: Labels,
  ): Effect.Effect<OpenedWindow<Labels>, BrowserApiError, Tabs | Windows | Scope.Scope>
  /**
   * その他のブックマークに「root」フォルダを作り、`seeds` を順に入れる。タイトルはどれも違うこと。
   * 作るまでのイベントは観察に含めず、場面が終わるとフォルダごと消す。
   */
  openBookmarks(
    seeds: ReadonlyArray<BookmarkSeed>,
  ): Effect.Effect<OpenedBookmarks, BrowserApiError, Bookmarks | Scope.Scope>
  /** 場面の中で開いたタブに名前を付ける。名前の無いタブは `?1`, `?2`… と表す。 */
  name(tabId: TabId, label: string): void
  /** ここまでのイベントを観察に含めずに捨てる。 */
  readonly skipEvents: Effect.Effect<void>
  /**
   * 前回から届いたイベントのうち、場面のウィンドウとブックマークに関わるものを、種類ごとに届いた順で表す。
   *
   * @remarks
   * タブの移動とグループの変化は、タブの変化とは別の列にする。Katip はどちらにも反応せず、
   * 他のイベントとの前後は Chrome の版によって違う（149 と 156 で入れ替わる）。
   * 同じ理由で、タブが既に入っているグループへの変化（149 だけが送る）は表さない。
   * 空の列は含めない。
   */
  readonly events: Effect.Effect<Observation>
  /**
   * イベント、`returned`、ウィンドウのタブの並び、ブックマークの順に表す。名前の無いグループや
   * 分割には、この順で初めて現れたものから `g1`・`s1` と名前を付ける。
   *
   * @remarks
   * タブの並びは、ウィンドウが 1 つなら `strip`、2 つ以上なら `strips` にウィンドウの名前ごとに入れる。
   */
  observe(target: ObservationTarget): Effect.Effect<Observation, BrowserApiError, Tabs | Bookmarks>
  /** `windowId` のタブを index 順に表す。 */
  strip(windowId: WindowId): Effect.Effect<ReadonlyArray<string>, BrowserApiError, Tabs>
  /** `id` の子を順に表す。フォルダは `F[子 …]`、子を読み込んでいないフォルダは `F[?]`。 */
  tree(id: BookmarkId): Effect.Effect<ReadonlyArray<string>, BrowserApiError, Bookmarks>
  /** 例: `"c@2 pinned g1 s1 active"` */
  tab(tab: BrowserTab): string
  tabLabel(tabId: TabId): string
  groupLabel(groupId: TabGroupId): string
  splitLabel(splitViewId: SplitViewId): string
  bookmark(node: BookmarkNode): string
  /** 成功すれば `render` した値、`BrowserApiError` で失敗すれば `"failed"`。 */
  attempt<A, R>(
    effect: Effect.Effect<A, BrowserApiError, R>,
    render: (value: A) => Json,
  ): Effect.Effect<Json, never, R>
}

interface Labeler<Id> {
  readonly known: (id: Id) => boolean
  readonly set: (id: Id, label: string) => void
  readonly of: (id: Id) => string
}

const makeLabeler = <Id>(nextLabel: (count: number) => string): Labeler<Id> => {
  const labels = new Map<Id, string>()
  let issued = 0
  return {
    known: (id) => labels.has(id),
    set: (id, label) => void labels.set(id, label),
    of: (id) => {
      const existing = labels.get(id)
      if (existing !== undefined) return existing
      issued += 1
      const label = nextLabel(issued)
      labels.set(id, label)
      return label
    },
  }
}

const UNNAMED_TAB = (count: number) => `?${count}`

const renderChanges = (
  changes: TabChanges,
  groupLabel: (id: TabGroupId) => string,
  splitLabel: (id: SplitViewId) => string,
): ReadonlyArray<string> => [
  ...(changes.pinned === undefined ? [] : [`pinned=${changes.pinned}`]),
  ...(changes.groupId === undefined
    ? []
    : [`group=${Option.match(changes.groupId, { onNone: () => "none", onSome: groupLabel })}`]),
  ...(changes.splitViewId === undefined
    ? []
    : [`split=${Option.match(changes.splitViewId, { onNone: () => "none", onSome: splitLabel })}`]),
  ...(changes.discarded === undefined ? [] : [`discarded=${changes.discarded}`]),
  ...(changes.muted === undefined ? [] : [`muted=${changes.muted}`]),
]

const describeGroup = (label: string, group: BrowserTabGroup) =>
  `${label} title=${JSON.stringify(Option.getOrElse(group.title, () => ""))} collapsed=${group.collapsed}`

interface EventColumns {
  readonly tabs: Array<string>
  readonly moves: Array<string>
  readonly groups: Array<string>
  readonly bookmarks: Array<string>
}

export const makeStage: Effect.Effect<Stage, never, ContractRig> = Effect.gen(function* () {
  const rig = yield* ContractRig
  const tabs = makeLabeler<TabId>(UNNAMED_TAB)
  const windows = makeLabeler<WindowId>((count) => `w${count}`)
  const groups = makeLabeler<TabGroupId>((count) => `g${count}`)
  const splits = makeLabeler<SplitViewId>((count) => `s${count}`)
  const bookmarks = makeLabeler<BookmarkId>((count) => `?bookmark${count}`)
  const stageWindows = new Set<WindowId>()

  const describeTab = (snapshot: BrowserTab, head: string) =>
    [
      head,
      ...(snapshot.pinned ? ["pinned"] : []),
      ...Option.toArray(Option.map(snapshot.groupId, groups.of)),
      ...Option.toArray(Option.map(snapshot.splitViewId, splits.of)),
      ...(snapshot.discarded ? ["discarded"] : []),
      ...(snapshot.muted ? ["muted"] : []),
      ...(snapshot.active ? ["active"] : []),
    ].join(" ")

  const tab = (snapshot: BrowserTab) =>
    describeTab(snapshot, `${tabs.of(snapshot.id)}@${snapshot.index}`)

  const bookmark = (node: BookmarkNode): string =>
    node._tag === "Bookmark"
      ? bookmarks.of(node.id)
      : `${bookmarks.of(node.id)}[${Option.match(node.children, {
          onNone: () => "?",
          onSome: (children) => children.map(bookmark).join(" "),
        })}]`

  const inStage = (windowId: WindowId) => stageWindows.has(windowId)
  const at = (parentId: BookmarkId, index: number) => `${bookmarks.of(parentId)}@${index}`

  const record = (
    columns: EventColumns,
    knownGroups: Map<TabId, Option.Option<TabGroupId>>,
    event: BrowserEvent,
  ): void =>
    Match.valueTags(event, {
      TabCreated: ({ tab: created }) => {
        knownGroups.set(created.id, created.groupId)
        if (inStage(created.windowId)) columns.tabs.push(`created ${tab(created)}`)
      },
      TabUpdated: ({ tabId, changes: reported, tab: updated }) => {
        if (!tabs.known(tabId) && !inStage(updated.windowId)) return
        const { groupId, ...others } = reported
        const regrouped =
          groupId !== undefined &&
          !Option.exists(Option.fromUndefinedOr(knownGroups.get(tabId)), (known) =>
            Equal.equals(known, groupId),
          )
        knownGroups.set(tabId, updated.groupId)
        const changes = regrouped ? reported : others
        const rendered = renderChanges(changes, groups.of, splits.of)
        if (rendered.length > 0)
          columns.tabs.push(`updated ${tabs.of(tabId)} ${rendered.join(" ")}`)
      },
      TabActivated: ({ tabId, windowId }) => {
        if (inStage(windowId)) columns.tabs.push(`activated ${tabs.of(tabId)}`)
      },
      TabRemoved: ({ tabId, windowId, isWindowClosing }) => {
        if (!inStage(windowId)) return
        columns.tabs.push(`removed ${tabs.of(tabId)}${isWindowClosing ? " windowClosing" : ""}`)
      },
      TabReplaced: ({ addedTabId, removedTabId }) => {
        if (!tabs.known(removedTabId)) return
        tabs.set(addedTabId, `${tabs.of(removedTabId)}'`)
        columns.tabs.push(`replaced ${tabs.of(removedTabId)}→${tabs.of(addedTabId)}`)
      },
      TabDetached: ({ tabId, oldWindowId, oldPosition }) => {
        if (!inStage(oldWindowId)) return
        columns.tabs.push(`detached ${tabs.of(tabId)} ${windows.of(oldWindowId)}@${oldPosition}`)
      },
      TabAttached: ({ tabId, newWindowId, newPosition }) => {
        if (!inStage(newWindowId)) return
        columns.tabs.push(`attached ${tabs.of(tabId)} ${windows.of(newWindowId)}@${newPosition}`)
      },
      TabMoved: ({ tabId, windowId, fromIndex, toIndex }) => {
        if (inStage(windowId)) columns.moves.push(`${tabs.of(tabId)} ${fromIndex}→${toIndex}`)
      },
      TabGroupCreated: ({ group }) => {
        if (inStage(group.windowId)) columns.groups.push(`created ${groups.of(group.id)}`)
      },
      TabGroupUpdated: ({ group }) => {
        if (!inStage(group.windowId)) return
        columns.groups.push(`updated ${describeGroup(groups.of(group.id), group)}`)
      },
      TabGroupRemoved: ({ group }) => {
        if (inStage(group.windowId)) columns.groups.push(`removed ${groups.of(group.id)}`)
      },
      TabGroupMoved: ({ group }) => {
        if (inStage(group.windowId)) columns.groups.push(`moved ${groups.of(group.id)}`)
      },
      WindowCreated: ({ window }) => {
        if (inStage(window.id)) columns.tabs.push(`window created ${windows.of(window.id)}`)
      },
      WindowRemoved: ({ windowId }) => {
        if (inStage(windowId)) columns.tabs.push(`window removed ${windows.of(windowId)}`)
      },
      BookmarkCreated: ({ node }) => {
        if (!Option.exists(node.parentId, bookmarks.known)) return
        if (!bookmarks.known(node.id)) bookmarks.set(node.id, node.title)
        const place = Option.getOrElse(Option.zipWith(node.parentId, node.index, at), () => "?")
        columns.bookmarks.push(`created ${bookmark(node)} in ${place}`)
      },
      BookmarkChanged: ({ id, title, url }) => {
        if (!bookmarks.known(id)) return
        const urlPart = Option.match(url, { onNone: () => "", onSome: (value) => ` url=${value}` })
        columns.bookmarks.push(`changed ${bookmarks.of(id)} title=${title}${urlPart}`)
      },
      BookmarkMoved: ({ id, parentId, index, oldParentId, oldIndex }) => {
        if (!bookmarks.known(id)) return
        columns.bookmarks.push(
          `moved ${bookmarks.of(id)} ${at(oldParentId, oldIndex)}→${at(parentId, index)}`,
        )
      },
      BookmarkRemoved: ({ id, parentId, index, node }) => {
        if (!bookmarks.known(id)) return
        columns.bookmarks.push(`removed ${bookmark(node)} from ${at(parentId, index)}`)
      },
      BookmarkChildrenReordered: ({ id }) => {
        if (bookmarks.known(id)) columns.bookmarks.push(`reordered ${bookmarks.of(id)}`)
      },
      WindowFocusChanged: () => {},
      AlarmFired: () => {},
      CommandTriggered: () => {},
      RuntimeInstalled: () => {},
      RuntimeStartup: () => {},
    })

  const events = Effect.map(rig.takeEvents, (taken): Observation => {
    const columns: EventColumns = { tabs: [], moves: [], groups: [], bookmarks: [] }
    const knownGroups = new Map<TabId, Option.Option<TabGroupId>>()
    taken.forEach((event) => record(columns, knownGroups, event))
    return {
      ...(columns.tabs.length > 0 && { tabEvents: columns.tabs }),
      ...(columns.moves.length > 0 && { moveEvents: columns.moves }),
      ...(columns.groups.length > 0 && { groupEvents: columns.groups }),
      ...(columns.bookmarks.length > 0 && { bookmarkEvents: columns.bookmarks }),
    }
  })

  const skipEvents = Effect.asVoid(rig.takeEvents)

  const strip = (windowId: WindowId) =>
    Effect.map(
      Tabs.use((service) => service.query({ windowId })),
      (found) => found.map((snapshot) => describeTab(snapshot, tabs.of(snapshot.id))),
    )

  const tree = (id: BookmarkId) =>
    Effect.map(
      Bookmarks.use((service) => service.getSubTree(id)),
      (node) =>
        node._tag === "BookmarkFolder"
          ? Option.getOrElse(node.children, () => []).map(bookmark)
          : [],
    )

  const createBookmarks = (
    parentId: BookmarkId,
    seeds: ReadonlyArray<BookmarkSeed>,
  ): Effect.Effect<void, BrowserApiError, Bookmarks> =>
    Effect.forEach(
      seeds,
      Effect.fnUntraced(function* (seed) {
        const service = yield* Bookmarks
        if (typeof seed === "string") {
          const created = yield* service.create({ parentId, title: seed, url: bookmarkUrl(seed) })
          bookmarks.set(created.id, seed)
          return
        }
        const folder = yield* service.create({ parentId, title: seed.folder })
        bookmarks.set(folder.id, seed.folder)
        yield* createBookmarks(folder.id, seed.children)
      }),
      { discard: true },
    )

  const stage: Stage = {
    openWindow: <const Labels extends Array.NonEmptyReadonlyArray<string>>(labels: Labels) =>
      Effect.gen(function* () {
        const windowService = yield* Windows
        const tabService = yield* Tabs
        const [first, ...rest] = labels
        const window = yield* windowService.create({ url: pageUrl(first), focused: false })
        yield* Effect.addFinalizer(() => Effect.ignore(windowService.remove(window.id)))
        stageWindows.add(window.id)
        windows.of(window.id)
        const [firstTab] = yield* tabService.query({ windowId: window.id })
        if (firstTab === undefined) return yield* Effect.die("開いたウィンドウにタブが無い")
        tabs.set(firstTab.id, first)
        const restIds = yield* Effect.forEach(rest, (label) =>
          Effect.map(
            tabService.create({ windowId: window.id, url: pageUrl(label), active: false }),
            (created) => {
              tabs.set(created.id, label)
              return created.id
            },
          ),
        )
        yield* skipEvents
        // forEach は tuple の長さを型に残さないので、渡された名前の並びに合わせて戻す
        return {
          windowId: window.id,
          tabs: [firstTab.id, ...restIds],
        } as unknown as OpenedWindow<Labels>
      }),

    openBookmarks: Effect.fnUntraced(function* (seeds) {
      const service = yield* Bookmarks
      const root = yield* service.create({ title: "root" })
      yield* Effect.addFinalizer(() => Effect.ignore(service.removeTree(root.id)))
      bookmarks.set(root.id, "root")
      yield* createBookmarks(root.id, seeds)
      yield* skipEvents
      const tree = yield* service.getSubTree(root.id)
      const titled = (node: BookmarkNode): ReadonlyArray<readonly [string, BookmarkId]> => [
        [node.title, node.id],
        ...(node._tag === "BookmarkFolder"
          ? Option.getOrElse(node.children, () => []).flatMap(titled)
          : []),
      ]
      const ids = new Map(titled(tree))
      return {
        rootId: root.id,
        id: (title: string) => {
          const found = ids.get(title)
          if (found === undefined) throw new Error(`仕込んでいないブックマーク: ${title}`)
          return found
        },
      }
    }),

    observe: Effect.fnUntraced(function* (target) {
      const observedEvents = yield* events
      const returned = target.returned === undefined ? {} : { returned: target.returned() }
      const windowIds = target.windows ?? []
      const strips = yield* Effect.forEach(windowIds, (windowId) =>
        Effect.map(strip(windowId), (rendered) => [windows.of(windowId), rendered] as const),
      )
      const [only, ...others] = strips
      const stripPart =
        only === undefined
          ? {}
          : others.length === 0
            ? { strip: only[1] }
            : { strips: Object.fromEntries(strips) }
      const treePart = target.bookmarks === undefined ? {} : { tree: yield* tree(target.bookmarks) }
      return { ...returned, ...stripPart, ...treePart, ...observedEvents }
    }),
    name: (tabId, label) => tabs.set(tabId, label),
    skipEvents,
    events,
    strip,
    tree,
    tab,
    tabLabel: tabs.of,
    groupLabel: groups.of,
    splitLabel: splits.of,
    bookmark,
    attempt: (effect, render) =>
      Effect.match(effect, { onFailure: (): Json => "failed", onSuccess: render }),
  }
  return stage
})
