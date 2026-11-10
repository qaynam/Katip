import { Array, Clock, Effect, Match, Option, pipe } from "effect"
import { type Action, actionTitle, availableActions, type ActionContext } from "#modules/actions"
import {
  BangCatalog,
  type BangIndex,
  bangIndexOf,
  bangSearchIn,
  bangSuggestionsFor,
  emptyBangIndex,
  layeredIndex,
  siteUrlOf,
  triggerBeingTyped,
} from "#modules/bangs"
import type { Favorite } from "#modules/favorites"
import { makeTranslator } from "#modules/i18n"
import {
  PinnedBookmarks,
  type PinnedBookmark,
  type PinnedSplit,
  type PinnedTree,
} from "#modules/pinned"
import { type PageShortcutSettings, SettingsRepository } from "#modules/settings"
import {
  bangsOfSiteCommands,
  type ListedSiteCommand,
  listedSiteCommands,
  searchesWithQuery,
  SiteCommands,
} from "#modules/site-commands"
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
const BANG_SUGGESTION_LIMIT = 5

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

const favoriteCandidate = (favorite: Favorite): ResultCandidate => ({
  kind: "Favorite",
  title: favorite.title,
  url: favorite.url,
  lastUsedAt: Option.none(),
  isCurrent: false,
  result: { _tag: "Favorite", favoriteId: favorite.id, title: favorite.title, url: favorite.url },
})

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

// Bookmarklets are left out: opened in a new tab, they don't work
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
  // An optional permission: until it's granted, chrome.history doesn't exist at all
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
  // An open pin is offered only as its tab; as a pin too, the same page would be listed twice
  const closedPins = pins.filter(({ node }) =>
    bookmarksOf(node).every((pin) => !openPinIds.has(pin.id)),
  )
  const openFavoriteIds = new Set(
    (yield* state.favoriteTabs.get).flatMap(({ tabId, favoriteId }) =>
      openTabIds.has(tabId) ? [favoriteId] : [],
    ),
  )
  // Like a pin, an open Favorite is offered only as its tab
  const closedFavorites = (yield* state.favorites.get).filter(
    (favorite) => !openFavoriteIds.has(favorite.id),
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
      Effect.as(Effect.logWarning("Spotlight couldn't search bookmarks", error), []),
    ),
  )
  // History also holds the pages of open tabs and pins; they're removed so no page is listed twice
  const shownUrls = new Set([
    ...tabs.map(urlOf),
    ...pins.flatMap(({ node }) => bookmarksOf(node).map((pin) => pin.url)),
    ...closedFavorites.map((favorite) => favorite.url),
    ...bookmarks.map((bookmark) => bookmark.url),
  ])
  const history = yield* historyCandidates(query, shownUrls).pipe(
    Effect.catch((error) =>
      Effect.as(Effect.logWarning("Spotlight couldn't search history", error), []),
    ),
  )
  return [
    ...tabs.map(toTabCandidate),
    ...closedPins.map(pinCandidate),
    ...closedFavorites.map(favoriteCandidate),
    ...spaces.map(spaceCandidate(activeSpaceOf(workspace, callerWindowId))),
    ...bookmarks,
    ...history,
  ]
})

interface ShortcutEnvironment {
  /** The key assigned to each extension command, by command name. */
  readonly assigned: ReadonlyMap<string, string>
  readonly pageShortcuts: PageShortcutSettings
}

// A copy shortcut turned off keeps its key in Chrome, but showing the key would suggest it works
const shortcutOf = (action: Action, environment: ShortcutEnvironment): string | null => {
  const assigned = (command: string) => environment.assigned.get(command) ?? null
  return Match.valueTags(action, {
    CopyUrl: () =>
      environment.pageShortcuts.copyUrl ? assigned(KeyboardCommand.copyCurrentUrl) : null,
    CopyMarkdownLink: () =>
      environment.pageShortcuts.copyMarkdownLink
        ? assigned(KeyboardCommand.copyCurrentUrlAsMarkdown)
        : null,
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
        Effect.logWarning("Couldn't read the assigned keys", error),
        new Map<string, string>(),
      ),
    ),
  )
  const { pageShortcuts } = yield* (yield* SettingsRepository).get
  return { assigned, pageShortcuts } satisfies ShortcutEnvironment
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

// Commands can also be found by their English names, whatever the display language
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

const siteCommandCandidate = (
  command: ListedSiteCommand,
  englishTitle: string,
): ResultCandidate => ({
  kind: "Action",
  title: command.title,
  keywords: [
    ...(englishTitle === command.title ? [] : [englishTitle]),
    ...(command.keyword === null ? [] : [command.keyword]),
  ],
  url: "",
  lastUsedAt: Option.none(),
  isCurrent: false,
  result: {
    _tag: "SiteCommand",
    title: command.title,
    url: command.url,
    keyword: command.keyword,
    searches: searchesWithQuery(command.url),
    iconPageUrl: command.iconPageUrl,
  },
})

// Like the other commands, those Katip comes with can also be found by their English names
const siteCommandCandidates = Effect.gen(function* () {
  const list = yield* (yield* SiteCommands).get
  const englishTitles = listedSiteCommands(list, english).map((command) => command.title)
  return listedSiteCommands(list, yield* currentTranslator).map((command, at) =>
    siteCommandCandidate(command, englishTitles[at] ?? command.title),
  )
})

// The keywords of the commands come before the bundled bangs, so a keyword can take over a
// trigger of the list
/** The bangs of the commands in the list, and those over the bundled ones when bangs are on. */
const bangIndexesFor = Effect.fnUntraced(function* (commands: ReadonlyArray<ListedSiteCommand>) {
  const own = bangIndexOf(bangsOfSiteCommands(commands))
  if (!(yield* (yield* SettingsRepository).get).bangs) return { own, all: own }
  const bundled = yield* (yield* BangCatalog).contents.pipe(
    Effect.map((contents) => contents.index),
    Effect.catch((error) =>
      Effect.as(Effect.logWarning("Couldn't read the bundled bangs", error), emptyBangIndex),
    ),
  )
  return { own, all: layeredIndex(own, bundled) }
})

/**
 * The bangs offered while a trigger is typed: the commands in the list first, the ones people keep
 * at hand, then the rest. A ! alone offers the list's commands alone, as every bundled bang would
 * match it.
 */
const offeredBangs = (query: string, own: BangIndex, all: BangIndex, limit: number) => {
  if (Option.contains(triggerBeingTyped(query), "")) return own.startingWith("", limit)
  const fromList = bangSuggestionsFor(query, own, limit)
  const rest = bangSuggestionsFor(query, all, limit + fromList.length).filter(
    (match) => !fromList.some((listed) => listed.bang === match.bang),
  )
  return [...fromList, ...rest].slice(0, limit)
}

const bangResults = Effect.fnUntraced(function* (query: string) {
  // Most searches have no bang, and the bundled list is only read for one that might
  if (!query.includes("!")) return []
  const list = yield* (yield* SiteCommands).get
  const { own, all } = yield* bangIndexesFor(listedSiteCommands(list, yield* currentTranslator))
  const search = bangSearchIn(query, all)
  const suggestions = offeredBangs(query, own, all, BANG_SUGGESTION_LIMIT + 1)
    .filter((match) => !Option.exists(search, ({ bang }) => bang === match.bang))
    .slice(0, BANG_SUGGESTION_LIMIT)
  return [
    ...Option.toArray(search).map(({ bang, trigger, query: searched, url }): SpotlightResult => ({
      _tag: "SiteSearch",
      siteName: bang.name,
      trigger,
      query: searched,
      url,
      iconPageUrl: siteUrlOf(bang),
    })),
    ...suggestions.map(({ bang, trigger }): SpotlightResult => ({
      _tag: "BangSuggestion",
      siteName: bang.name,
      trigger,
      iconPageUrl: siteUrlOf(bang),
    })),
  ]
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
 * Finds the results to list for `query` in Spotlight opened over the `callerWindowId` window.
 *
 * @remarks
 * `Actions` returns commands only. `All` adds commands and browsing history (the latter only with
 * the `history` permission) only when something has been typed. In `All`, a bang typed with `!`
 * (one of a command's keywords, or one of the bundled list while bangs are on) puts its site search
 * first, and a trigger being typed is followed by the bangs it can become.
 *
 * Never fails. When tabs or bookmarks can't be read, they're treated as having no results, and
 * only the items for opening the URL and searching the web are returned.
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
          Effect.as(Effect.logWarning("Couldn't gather Spotlight commands", error), []),
        ),
      )
    : []
  const siteCommands = wantsActions
    ? yield* siteCommandCandidates.pipe(
        Effect.catch((error) =>
          Effect.as(Effect.logWarning("Couldn't gather the site commands", error), []),
        ),
      )
    : []
  // In command mode too: a bang typed there is chosen into the usual search
  const bangs = yield* bangResults(query).pipe(
    Effect.catch((error) =>
      Effect.as(Effect.logWarning("Couldn't look up Spotlight's bangs", error), []),
    ),
  )
  const others =
    mode === "All"
      ? yield* gatherCandidates(callerWindowId, query).pipe(
          Effect.catch((error) =>
            Effect.as(Effect.logWarning("Couldn't gather Spotlight results", error), []),
          ),
        )
      : []
  const now = yield* Clock.currentTimeMillis
  // A ! alone is a bang about to be typed: pages with a ! in them, or a web search for it, would
  // only stand between it and the bangs
  if (query.trim() === "!") {
    return { results: bangs, spaceTheme: yield* activeSpaceTheme(callerWindowId) }
  }
  return {
    results: [
      ...bangs,
      ...searchSpotlight(query, [...others, ...actions, ...siteCommands], {
        mode,
        now,
        limit: RESULT_LIMIT,
      }).map(toResult),
    ],
    spaceTheme: yield* activeSpaceTheme(callerWindowId),
  }
})
