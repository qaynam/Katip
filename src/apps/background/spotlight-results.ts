import { Array, Clock, Effect, Match, Option, pipe } from "effect"
import { type Action, actionTitle, availableActions, type ActionContext } from "#modules/actions"
import { makeTranslator } from "#modules/i18n"
import {
  PinnedBookmarks,
  type PinnedBookmark,
  type PinnedSplit,
  type PinnedTree,
} from "#modules/pinned"
import type { Space, SpaceId } from "#modules/space"
import { type SearchCandidate, searchSpotlight, type SpotlightEntry } from "#modules/spotlight"
import { activeSpaceOf, trackedTab, type Workspace } from "#modules/workspace"
import {
  type BookmarkId,
  Bookmarks,
  type BrowserTab,
  Tabs,
  type WindowId,
  Windows,
} from "#platform/browser"
import { History } from "#platform/history"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import { Permissions } from "#platform/permissions"
import type { SpotlightMode, SpotlightResult } from "#protocol"
import { KatipState } from "./katip-state"
import { KeyboardCommand } from "./keyboard-commands"
import { urlOf } from "./tab-admission"
import { currentTranslator } from "./translation"

const RESULT_LIMIT = 40
const HISTORY_LIMIT = 50

interface ResultCandidate extends SearchCandidate {
  readonly result: SpotlightResult
}

interface PinSource {
  readonly space: Space
  readonly node: PinnedBookmark | PinnedSplit
  readonly folderPath: ReadonlyArray<string>
}

const pinsIn = (
  space: Space,
  tree: PinnedTree,
  folderPath: ReadonlyArray<string>,
): ReadonlyArray<PinSource> =>
  tree.flatMap((node) =>
    Match.valueTags(node, {
      PinnedBookmark: (bookmark) => [{ space, node: bookmark, folderPath }],
      PinnedSplit: (split) => [{ space, node: split, folderPath }],
      PinnedLiveFolder: () => [],
      PinnedFolder: (folder) => pinsIn(space, folder.children, [...folderPath, folder.title]),
    }),
  )

const bookmarksOf = (node: PinnedBookmark | PinnedSplit): ReadonlyArray<PinnedBookmark> =>
  node._tag === "PinnedSplit" ? node.items : [node]

const pinnedTitles = (pins: ReadonlyArray<PinSource>): ReadonlyMap<BookmarkId, string> =>
  new Map(pins.flatMap(({ node }) => bookmarksOf(node).map((pin) => [pin.id, pin.title] as const)))

const splitTitle = (split: PinnedSplit) =>
  split.title.trim() === "" ? split.items.map((item) => item.title).join(" | ") : split.title

const tabCandidate =
  (context: {
    readonly callerWindowId: WindowId
    readonly workspace: Workspace
    readonly spaces: ReadonlyMap<SpaceId, Space>
    readonly pinTitles: ReadonlyMap<BookmarkId, string>
  }) =>
  (tab: BrowserTab): ResultCandidate => {
    const tracked = trackedTab(context.workspace, tab.id)
    const url = urlOf(tab)
    const pinTitle = Option.flatMap(tracked, ({ pinned }) =>
      Option.flatMap(Option.fromNullishOr(pinned), ({ bookmarkId }) =>
        Option.fromNullishOr(context.pinTitles.get(bookmarkId)),
      ),
    )
    const title = pipe(
      pinTitle,
      Option.orElse(() =>
        Option.flatMap(tracked, ({ titleOverride }) => Option.fromNullishOr(titleOverride)),
      ),
      Option.orElse(() => tab.title),
      Option.getOrElse(() => url),
    )
    const space = Option.flatMap(tracked, ({ spaceId }) =>
      Option.fromNullishOr(context.spaces.get(spaceId)),
    )
    return {
      kind: "OpenTab",
      title,
      url,
      lastUsedAt: Option.orElse(tab.lastAccessed, () =>
        Option.map(tracked, ({ lastActiveAt }) => lastActiveAt),
      ),
      isCurrent: tab.active && tab.windowId === context.callerWindowId,
      result: {
        _tag: "OpenTab",
        tabId: tab.id,
        title,
        url,
        favIconUrl: Option.getOrNull(tab.favIconUrl),
        spaceName: Option.getOrNull(Option.map(space, ({ name }) => name)),
        isFavorite: tab.pinned,
        isInOtherWindow: tab.windowId !== context.callerWindowId,
      },
    }
  }

const pinCandidate = ({ space, node, folderPath }: PinSource): ResultCandidate => {
  const title = node._tag === "PinnedSplit" ? splitTitle(node) : node.title
  const url = node._tag === "PinnedSplit" ? node.items[0].url : node.url
  return {
    kind: "Pin",
    title,
    url,
    lastUsedAt: Option.none(),
    isCurrent: false,
    result: {
      _tag: "Pin",
      bookmarkId: node.id,
      title,
      url,
      spaceName: space.name,
      folderPath,
      isSplit: node._tag === "PinnedSplit",
    },
  }
}

const spaceCandidate =
  (activeSpaceId: Option.Option<SpaceId>) =>
  (space: Space): ResultCandidate => ({
    kind: "Space",
    title: space.name,
    url: "",
    lastUsedAt: Option.none(),
    isCurrent: false,
    result: {
      _tag: "Space",
      spaceId: space.id,
      name: space.name,
      theme: space.theme,
      isActive: Option.contains(activeSpaceId, space.id),
    },
  })

// ブックマークレットは新しいタブで開いても動かないので候補にしない
const isOpenableUrl = (url: string) => !url.toLowerCase().startsWith("javascript:")

const bookmarkCandidates = Effect.fnUntraced(function* (
  query: string,
  pinnedIds: ReadonlySet<BookmarkId>,
) {
  if (query.trim() === "") return []
  const found = yield* (yield* Bookmarks).search(query)
  return found.flatMap((node): ReadonlyArray<ResultCandidate> =>
    node._tag === "Bookmark" && !pinnedIds.has(node.id) && isOpenableUrl(node.url)
      ? [
          {
            kind: "Bookmark",
            title: node.title,
            url: node.url,
            lastUsedAt: Option.none(),
            isCurrent: false,
            result: { _tag: "Bookmark", bookmarkId: node.id, title: node.title, url: node.url },
          },
        ]
      : [],
  )
})

const historyCandidates = Effect.fnUntraced(function* (
  query: string,
  shownUrls: ReadonlySet<string>,
) {
  if (query.trim() === "") return []
  // 任意の権限なので、許可されるまでは chrome.history そのものが無い
  if (!(yield* (yield* Permissions).containsPermission("history"))) return []
  const pages = yield* (yield* History).search({
    text: query.trim(),
    maxResults: HISTORY_LIMIT,
    startTime: 0,
  })
  return pages.flatMap((page): ReadonlyArray<ResultCandidate> => {
    if (shownUrls.has(page.url) || !isOpenableUrl(page.url)) return []
    const title = page.title.trim() === "" ? page.url : page.title
    return [
      {
        kind: "History",
        title,
        url: page.url,
        lastUsedAt: Option.some(page.lastVisitedAt),
        isCurrent: false,
        result: { _tag: "History", title, url: page.url, lastVisitedAt: page.lastVisitedAt },
      },
    ]
  })
})

const gatherCandidates = Effect.fnUntraced(function* (callerWindowId: WindowId, query: string) {
  const state = yield* KatipState
  const spaces = yield* state.spaces.get
  const workspace = yield* state.workspace.get
  const normalWindowIds = new Set<WindowId>(
    (yield* (yield* Windows).getAll)
      .filter((window) => Option.contains(window.type, "normal"))
      .map((window) => window.id),
  )
  const tabs = (yield* (yield* Tabs).query({})).filter((tab) => normalWindowIds.has(tab.windowId))
  const trees = yield* (yield* PinnedBookmarks).loadAllSpaceTrees
  const pins = spaces.flatMap((space) =>
    Option.match(Option.fromNullishOr(trees.get(space.id)), {
      onNone: () => [],
      onSome: (tree) => pinsIn(space, tree, []),
    }),
  )
  const openTabIds = new Set(tabs.map((tab) => tab.id))
  const openPinIds = new Set(
    workspace.tabs.flatMap(({ tabId, pinned }) =>
      pinned !== null && openTabIds.has(tabId) ? [pinned.bookmarkId] : [],
    ),
  )
  // 開いているピンは、そのタブを候補にする。ピンとしても出すと同じページが 2 行並ぶ
  const closedPins = pins.filter(({ node }) =>
    bookmarksOf(node).every((pin) => !openPinIds.has(pin.id)),
  )
  const pinnedIds = new Set(pins.flatMap(({ node }) => bookmarksOf(node).map((pin) => pin.id)))
  const toTabCandidate = tabCandidate({
    callerWindowId,
    workspace,
    spaces: new Map(spaces.map((space) => [space.id, space])),
    pinTitles: pinnedTitles(pins),
  })
  const bookmarks = yield* bookmarkCandidates(query, pinnedIds).pipe(
    Effect.catch((error) =>
      Effect.as(Effect.logWarning("Spotlight でブックマークを検索できなかった", error), []),
    ),
  )
  // 履歴には開いているタブやピンのページも残っているので、同じページが 2 行並ばないよう除く
  const shownUrls = new Set([
    ...tabs.map(urlOf),
    ...pins.flatMap(({ node }) => bookmarksOf(node).map((pin) => pin.url)),
    ...bookmarks.map((bookmark) => bookmark.url),
  ])
  const history = yield* historyCandidates(query, shownUrls).pipe(
    Effect.catch((error) =>
      Effect.as(Effect.logWarning("Spotlight で履歴を検索できなかった", error), []),
    ),
  )
  return [
    ...tabs.map(toTabCandidate),
    ...closedPins.map(pinCandidate),
    ...spaces.map(spaceCandidate(activeSpaceOf(workspace, callerWindowId))),
    ...bookmarks,
    ...history,
  ]
})

interface ShortcutEnvironment {
  /** 拡張のコマンドの名前ごとに割り当てられたキー。 */
  readonly assigned: ReadonlyMap<string, string>
}

const shortcutOf = (action: Action, environment: ShortcutEnvironment): string | null => {
  const assigned = (command: string) => environment.assigned.get(command) ?? null
  return Match.valueTags(action, {
    CopyUrl: () => assigned(KeyboardCommand.copyCurrentUrl),
    CopyMarkdownLink: () => assigned(KeyboardCommand.copyCurrentUrlAsMarkdown),
    TogglePin: () => assigned(KeyboardCommand.quickPinToggle),
    DuplicateTab: () => null,
    CloseTab: () => null,
    ToggleMute: () => null,
    MoveTabToSpace: () => null,
    CloseTemporaryTabs: () => null,
    OpenSettings: () => null,
  })
}

const shortcutEnvironment = Effect.gen(function* () {
  const assigned = yield* (yield* KeyboardShortcuts).assigned.pipe(
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning("キーの割り当てを読めなかった", error),
        new Map<string, string>(),
      ),
    ),
  )
  return { assigned } satisfies ShortcutEnvironment
})

const actionContextOf = Effect.fnUntraced(function* (callerWindowId: WindowId) {
  const state = yield* KatipState
  const workspace = yield* state.workspace.get
  const [activeTab] = yield* (yield* Tabs).query({ windowId: callerWindowId, active: true })
  return {
    activeTab: Option.map(Option.fromNullishOr(activeTab), (tab) => ({
      isMuted: tab.muted,
      membership: Option.map(trackedTab(workspace, tab.id), ({ spaceId, pinned }) => ({
        spaceId,
        isPinned: pinned !== null,
      })),
    })),
    activeSpaceId: activeSpaceOf(workspace, callerWindowId),
    spaces: yield* state.spaces.get,
  } satisfies ActionContext
})

const english = makeTranslator("en")

// 表示の言語が英語以外でも、英語の名前で引けるようにする
const actionCandidates = Effect.fnUntraced(function* (callerWindowId: WindowId) {
  const context = yield* actionContextOf(callerWindowId)
  const translator = yield* currentTranslator
  const environment = yield* shortcutEnvironment
  return availableActions(context).map((action): ResultCandidate => {
    const title = actionTitle(action, context, translator)
    const englishTitle = actionTitle(action, context, english)
    return {
      kind: "Action",
      title,
      keywords: englishTitle === title ? [] : [englishTitle],
      url: "",
      lastUsedAt: Option.none(),
      isCurrent: false,
      result: { _tag: "Action", action, title, shortcut: shortcutOf(action, environment) },
    }
  })
})

const toResult = (entry: SpotlightEntry<ResultCandidate>): SpotlightResult =>
  Match.valueTags(entry, {
    Candidate: ({ candidate }) => candidate.result,
    OpenUrl: ({ url }): SpotlightResult => ({ _tag: "OpenUrl", url }),
    SearchWeb: ({ query }): SpotlightResult => ({ _tag: "SearchWeb", query }),
  })

const activeSpaceTheme = Effect.fnUntraced(function* (callerWindowId: WindowId) {
  const state = yield* KatipState
  const spaces = yield* state.spaces.get
  return pipe(
    activeSpaceOf(yield* state.workspace.get, callerWindowId),
    Option.flatMap((spaceId) => Array.findFirst(spaces, (space) => space.id === spaceId)),
    Option.map((space) => space.theme),
    Option.getOrNull,
  )
})

/**
 * `callerWindowId` のウィンドウから開いた Spotlight に、`query` で並べる候補を求める。
 *
 * @remarks
 * `Actions` では操作だけを返す。`All` では入力があるときだけ操作と閲覧履歴（`history` の権限が
 * あるときだけ）も候補に加える。
 *
 * 失敗しない。タブやブックマークを読めなかったときは候補を空とみなし、
 * URL を開く項目とウェブ検索の項目だけを返す。
 */
export const findSpotlightResults = Effect.fnUntraced(function* (
  callerWindowId: WindowId,
  query: string,
  mode: SpotlightMode,
) {
  const wantsActions = mode === "Actions" || query.trim() !== ""
  const actions = wantsActions
    ? yield* actionCandidates(callerWindowId).pipe(
        Effect.catch((error) =>
          Effect.as(Effect.logWarning("Spotlight の操作を集められなかった", error), []),
        ),
      )
    : []
  const others =
    mode === "All"
      ? yield* gatherCandidates(callerWindowId, query).pipe(
          Effect.catch((error) =>
            Effect.as(Effect.logWarning("Spotlight の候補を集められなかった", error), []),
          ),
        )
      : []
  const now = yield* Clock.currentTimeMillis
  return {
    results: searchSpotlight(query, [...others, ...actions], {
      mode,
      now,
      limit: RESULT_LIMIT,
    }).map(toResult),
    spaceTheme: yield* activeSpaceTheme(callerWindowId),
  }
})
