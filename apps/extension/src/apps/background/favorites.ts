import { Array, Clock, Effect, Option, Order } from "effect"
import {
  bindTab,
  claimFavoriteRecord,
  favoriteById,
  FavoriteId,
  favoriteOfTab,
  favoritesOf,
  findFavorite,
  followTabOrder,
  indexBetween,
  insertFavorite,
  keepOpenTabs,
  moveFavorite,
  pinnedIndexOf,
  removeFavorite,
  replaceBoundTab,
  resolveFavoriteId,
  tabsOfFavorite,
  unbindFavorite,
  unbindTab,
  updateFavoritesOf,
  type FavoriteList,
  type FavoriteTabs,
  type SpaceFavorites,
} from "#modules/favorites"
import type { SpaceId } from "#modules/space"
import { assignTab, forgetTab, shownSpaceOf, spaceOf, switchSpace } from "#modules/workspace"
import { Tabs, type BrowserTab, type TabId, type WindowId } from "#platform/browser"
import { KatipState } from "./katip-state"
import { forgetPendingTab, isProvisionalTab, urlOf } from "./tab-admission"

const byIndex = Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index)

export const newFavoriteId = Effect.sync(() => FavoriteId.make(crypto.randomUUID()))

const titleOf = (tab: BrowserTab) => Option.getOrElse(tab.title, () => urlOf(tab))

const tabsIn = (windowId: WindowId) =>
  Effect.map(
    Tabs.use((tabs) => tabs.query({ windowId })),
    (tabs) => Array.sort(tabs, byIndex),
  )

const shownSpaceIn = Effect.fnUntraced(function* (windowId: WindowId) {
  const state = yield* KatipState
  return shownSpaceOf(yield* state.workspace.get, yield* state.spaces.get, windowId)
})

const isListed = (list: FavoriteList, id: FavoriteId) => Option.isSome(favoriteById(list, id))

/** The Favorites of `list` open among `pinnedTabs`, in the order of their tabs. */
const openOrderOf = (
  pinnedTabs: ReadonlyArray<BrowserTab>,
  bindings: FavoriteTabs,
  list: FavoriteList,
) =>
  pinnedTabs.flatMap((tab) =>
    Option.toArray(Option.filter(favoriteOfTab(bindings, tab.id), (id) => isListed(list, id))),
  )

/** The Favorites with a tab among `windowTabs`, pinned or not. */
const favoritesOpenAmong = (windowTabs: ReadonlyArray<BrowserTab>, bindings: FavoriteTabs) =>
  new Set(windowTabs.flatMap((tab) => Option.toArray(favoriteOfTab(bindings, tab.id))))

/** The Space whose Favorite the tab is open for. */
const spaceOfBoundTab = (favorites: SpaceFavorites, bindings: FavoriteTabs, tabId: TabId) =>
  Option.map(
    Option.flatMap(favoriteOfTab(bindings, tabId), (id) => findFavorite(favorites, id)),
    (found) => found.spaceId,
  )

/** The Space whose Favorite the tab is open for. None for a tab that isn't a Favorite's. */
export const spaceOfFavoriteTab = Effect.fnUntraced(function* (tabId: TabId) {
  const state = yield* KatipState
  return spaceOfBoundTab(yield* state.spaceFavorites.get, yield* state.favoriteTabs.get, tabId)
})

/** The Space of each of the tabs that is open for a Favorite. */
export const favoriteTabSpaces = Effect.fnUntraced(function* (tabs: ReadonlyArray<BrowserTab>) {
  const state = yield* KatipState
  const favorites = yield* state.spaceFavorites.get
  const bindings = yield* state.favoriteTabs.get
  return new Map(
    tabs.flatMap((tab) =>
      Option.toArray(
        Option.map(
          spaceOfBoundTab(favorites, bindings, tab.id),
          (spaceId) => [tab.id, spaceId] as const,
        ),
      ),
    ),
  ) as ReadonlyMap<TabId, SpaceId>
})

const claimRestored = Effect.fnUntraced(function* (
  tab: BrowserTab,
  resolve: (favoriteId: FavoriteId) => Option.Option<FavoriteId>,
) {
  const state = yield* KatipState
  const queue = yield* state.favoriteRestoreQueue.get
  if (queue === null) return Option.none<FavoriteId>()
  const claimed = claimFavoriteRecord(
    queue,
    { url: urlOf(tab), isPinned: tab.pinned },
    yield* Clock.currentTimeMillis,
    resolve,
  )
  if (Option.isNone(claimed)) return Option.none<FavoriteId>()
  const [favoriteId, rest] = claimed.value
  yield* state.favoriteRestoreQueue.update(() => rest)
  return Option.some(favoriteId)
})

/**
 * Resolves a restore record's Favorite to one that still exists and has no tab in the window yet.
 * `spaceId` is where a Favorite from the time every Space shared them is looked for.
 */
const wantedIn =
  (
    favorites: SpaceFavorites,
    openInWindow: ReadonlySet<FavoriteId>,
    spaceId: Option.Option<SpaceId>,
  ) =>
  (favoriteId: FavoriteId) =>
    Option.filter(
      Option.map(resolveFavoriteId(favorites, favoriteId, spaceId), (found) => found.favorite.id),
      (id) => !openInWindow.has(id),
    )

const addFavoriteBeside = Effect.fnUntraced(function* (
  tab: BrowserTab,
  spaceId: SpaceId,
  windowTabs: ReadonlyArray<BrowserTab>,
  bindings: FavoriteTabs,
) {
  const state = yield* KatipState
  const pinnedTabs = windowTabs.filter((pinned) => pinned.pinned)
  const position = pinnedTabs.findIndex((pinned) => pinned.id === tab.id)
  const nearestOpen = (side: ReadonlyArray<BrowserTab>) =>
    Array.findFirst(side, (pinned) => favoriteOfTab(bindings, pinned.id))
  const before = nearestOpen(position < 0 ? [] : pinnedTabs.slice(0, position).reverse())
  const after = nearestOpen(position < 0 ? [] : pinnedTabs.slice(position + 1))
  const favorite = { id: yield* newFavoriteId, url: urlOf(tab), title: titleOf(tab) }
  yield* state.spaceFavorites.update((current) =>
    updateFavoritesOf(current, spaceId, (list) =>
      insertFavorite(list, favorite, indexBetween(list, before, after)),
    ),
  )
  return favorite.id
})

/**
 * Makes a tab pinned in Chrome the tab of a Favorite of the Space its window shows: the one it was
 * the tab of before a restart, else one with the same URL that isn't open in its window yet, else
 * a new Favorite placed among the Favorites of the pinned tabs beside it.
 *
 * Does nothing to a tab that is already a Favorite's, and waits for a tab without a URL yet.
 */
export const adoptPinnedTab = Effect.fnUntraced(function* (tab: BrowserTab) {
  const state = yield* KatipState
  const url = urlOf(tab)
  const bindings = yield* state.favoriteTabs.get
  if (!tab.pinned || url === "" || Option.isSome(favoriteOfTab(bindings, tab.id))) return
  const shown = yield* shownSpaceIn(tab.windowId)
  if (Option.isNone(shown)) return
  const favorites = yield* state.spaceFavorites.get
  const windowTabs = yield* tabsIn(tab.windowId)
  const openHere = favoritesOpenAmong(windowTabs, bindings)
  const restored = yield* claimRestored(tab, wantedIn(favorites, openHere, shown))
  const existing = Option.orElse(restored, () =>
    Option.map(
      Array.findFirst(
        favoritesOf(favorites, shown.value),
        (favorite) => favorite.url === url && !openHere.has(favorite.id),
      ),
      (favorite) => favorite.id,
    ),
  )
  const favoriteId = yield* Option.match(existing, {
    onSome: Effect.succeed,
    onNone: () => addFavoriteBeside(tab, shown.value, windowTabs, bindings),
  })
  yield* state.favoriteTabs.update((current) => bindTab(current, tab.id, favoriteId))
})

/**
 * Gives a tab Chrome restored unpinned back to the Favorite it was the tab of before a restart,
 * while its Favorite's Space wasn't shown.
 *
 * @returns Whether the tab became a Favorite's. Only a tab not yet in a Space, or placed in one
 *   before its URL was known, can.
 */
export const restoreUnpinnedFavoriteTab = Effect.fnUntraced(function* (tab: BrowserTab) {
  const state = yield* KatipState
  const bindings = yield* state.favoriteTabs.get
  if (
    tab.pinned ||
    urlOf(tab) === "" ||
    (yield* state.favoriteRestoreQueue.get) === null ||
    Option.isSome(favoriteOfTab(bindings, tab.id))
  ) {
    return false
  }
  const isProvisional = yield* isProvisionalTab(tab.id)
  if (!isProvisional && Option.isSome(spaceOf(yield* state.workspace.get, tab.id))) return false
  const openHere = favoritesOpenAmong(yield* tabsIn(tab.windowId), bindings)
  const claimed = yield* claimRestored(
    tab,
    wantedIn(yield* state.spaceFavorites.get, openHere, Option.none()),
  )
  if (Option.isNone(claimed)) return false
  yield* state.favoriteTabs.update((current) => bindTab(current, tab.id, claimed.value))
  yield* state.workspace.update((workspace) => forgetTab(workspace, tab.id))
  yield* forgetPendingTab(tab.id)
  return true
})

/**
 * Pins in Chrome the tabs of the Favorites of the Space the window shows, in the order of those
 * Favorites, and unpins the tabs of other Spaces' Favorites, which stay open in the window as
 * their Space's tabs, as its temporary tabs do.
 *
 * @param windowTabs - The window's tabs, in index order.
 */
// Not closing the other Spaces' Favorites' tabs: reopening them on every switch would reload their
// pages and lose what they showed
const settleFavoritePinsAmong = Effect.fnUntraced(function* (
  windowId: WindowId,
  windowTabs: ReadonlyArray<BrowserTab>,
) {
  const state = yield* KatipState
  const tabs = yield* Tabs
  const shown = yield* shownSpaceIn(windowId)
  const favorites = yield* state.spaceFavorites.get
  const bindings = yield* state.favoriteTabs.get
  const list = Option.match(shown, {
    onNone: (): FavoriteList => [],
    onSome: (spaceId) => favoritesOf(favorites, spaceId),
  })
  const rankOf = (tab: BrowserTab) =>
    Option.match(favoriteOfTab(bindings, tab.id), {
      onNone: () => -1,
      onSome: (id) => list.findIndex((favorite) => favorite.id === id),
    })
  const isOtherSpaces = (tab: BrowserTab) =>
    Option.exists(
      spaceOfBoundTab(favorites, bindings, tab.id),
      (spaceId) => !Option.contains(shown, spaceId),
    )
  const pinning = (pinned: boolean) => (tab: BrowserTab) =>
    tabs
      .update(tab.id, { pinned })
      .pipe(
        Effect.catch((error) => Effect.logWarning("Couldn't pin or unpin a Favorite's tab", error)),
      )
  const leaving = windowTabs.filter((tab) => tab.pinned && isOtherSpaces(tab))
  const showing = Array.sort(
    windowTabs.filter((tab) => rankOf(tab) >= 0),
    Order.mapInput(Order.Number, rankOf),
  )
  const arriving = showing.filter((tab) => !tab.pinned)
  yield* Effect.forEach(leaving, pinning(false), { discard: true })
  yield* Effect.forEach(arriving, pinning(true), { discard: true })
  const pinnedNow =
    leaving.length === 0 && arriving.length === 0
      ? windowTabs.filter((tab) => tab.pinned)
      : Array.sort(yield* tabs.query({ windowId, pinned: true }), byIndex)
  const pinnedIds = new Set(pinnedNow.map((tab) => tab.id))
  yield* placeFirstInOrder(
    pinnedNow.map((tab) => tab.id),
    showing.filter((tab) => pinnedIds.has(tab.id)).map((tab) => tab.id),
  )
})

// Moves only the tabs out of place, one at a time, so tabs already in order send no move events
const placeFirstInOrder = Effect.fnUntraced(function* (
  current: ReadonlyArray<TabId>,
  wanted: ReadonlyArray<TabId>,
) {
  const tabs = yield* Tabs
  const movedTo = (order: ReadonlyArray<TabId>, tabId: TabId, index: number) => {
    const without = order.filter((id) => id !== tabId)
    return [...without.slice(0, index), tabId, ...without.slice(index)]
  }
  yield* Effect.reduce(
    wanted,
    (): ReadonlyArray<TabId> => current,
    (order, tabId, index) =>
      order[index] === tabId
        ? Effect.succeed(order)
        : tabs.move([tabId], { index }).pipe(
            Effect.as(movedTo(order, tabId, index)),
            Effect.catch((error) =>
              Effect.as(
                Effect.logWarning("Couldn't move a Favorite's tab into place", error),
                order,
              ),
            ),
          ),
  )
})

/** {@link settleFavoritePins} for one window. */
export const settleFavoritePinsIn = Effect.fnUntraced(function* (windowId: WindowId) {
  yield* settleFavoritePinsAmong(windowId, yield* tabsIn(windowId))
})

/**
 * Pins in Chrome the tabs of the Favorites of the Space each window shows, in the order of those
 * Favorites, and unpins the tabs of other Spaces' Favorites, which stay open as their Space's tabs.
 */
export const settleFavoritePins = Effect.gen(function* () {
  const state = yield* KatipState
  const bindings = yield* state.favoriteTabs.get
  const tabs = Array.sort(yield* (yield* Tabs).query({}), byIndex)
  const windowIds = Array.dedupe(
    tabs.filter((tab) => Option.isSome(favoriteOfTab(bindings, tab.id))).map((tab) => tab.windowId),
  )
  yield* Effect.forEach(
    windowIds,
    (windowId) =>
      settleFavoritePinsAmong(
        windowId,
        tabs.filter((tab) => tab.windowId === windowId),
      ),
    { discard: true },
  )
})

/** Shows the Space in the window, with its Favorites' tabs pinned and other Spaces' unpinned. */
export const showSpaceIn = Effect.fnUntraced(function* (windowId: WindowId, spaceId: SpaceId) {
  const state = yield* KatipState
  yield* state.workspace.update((workspace) => switchSpace(workspace, windowId, spaceId))
  yield* settleFavoritePinsIn(windowId)
})

/** The tab of the Space's Favorites in the window used last. */
export const lastUsedFavoriteTabIn = Effect.fnUntraced(function* (
  windowId: WindowId,
  spaceId: SpaceId,
) {
  const state = yield* KatipState
  const list = favoritesOf(yield* state.spaceFavorites.get, spaceId)
  const bindings = yield* state.favoriteTabs.get
  return Option.map(
    Array.match(
      (yield* tabsIn(windowId)).filter((tab) =>
        Option.exists(favoriteOfTab(bindings, tab.id), (id) => isListed(list, id)),
      ),
      {
        onEmpty: () => Option.none<BrowserTab>(),
        onNonEmpty: (open) =>
          Option.some(
            Array.max(
              open,
              Order.mapInput(Order.Number, (tab: BrowserTab) =>
                Option.getOrElse(tab.lastAccessed, () => 0),
              ),
            ),
          ),
      },
    ),
    (tab) => tab.id,
  )
})

/**
 * Activates the Favorite's tab in the window, opening it there at its place among the pinned tabs
 * when it is closed. A window showing another Space switches to the Favorite's first.
 *
 * @returns false when the Favorite no longer exists.
 */
export const openFavorite = Effect.fnUntraced(function* (
  windowId: WindowId,
  favoriteId: FavoriteId,
) {
  const state = yield* KatipState
  const tabs = yield* Tabs
  const found = findFavorite(yield* state.spaceFavorites.get, favoriteId)
  if (Option.isNone(found)) return false
  const { spaceId, favorite } = found.value
  yield* showSpaceIn(windowId, spaceId)
  const bindings = yield* state.favoriteTabs.get
  const windowTabs = yield* tabsIn(windowId)
  const open = Array.findFirst(windowTabs, (tab) =>
    Option.contains(favoriteOfTab(bindings, tab.id), favoriteId),
  )
  if (Option.isSome(open)) {
    yield* tabs.update(open.value.id, { active: true })
    return true
  }
  const list = favoritesOf(yield* state.spaceFavorites.get, spaceId)
  const pinnedTabs = windowTabs.filter((tab) => tab.pinned)
  const index = pinnedIndexOf(list, favoriteId, new Set(openOrderOf(pinnedTabs, bindings, list)))
  const created = yield* tabs.create({ windowId, url: favorite.url, pinned: true, index })
  yield* state.favoriteTabs.update((current) => bindTab(current, created.id, favoriteId))
  return true
})

/**
 * Saves the tab as a Favorite of the Space at `index`. Its tab is pinned in Chrome while the Space
 * is shown. A tab that is already a Favorite's moves its Favorite to `index` instead.
 */
export const addToFavorites = Effect.fnUntraced(function* (
  tabId: TabId,
  spaceId: SpaceId,
  index: Option.Option<number>,
) {
  const state = yield* KatipState
  const bound = favoriteOfTab(yield* state.favoriteTabs.get, tabId)
  if (Option.isSome(bound)) {
    if (Option.isSome(index)) yield* moveFavoriteTo(bound.value, index.value)
    return
  }
  const tab = yield* (yield* Tabs).get(tabId)
  const favorite = { id: yield* newFavoriteId, url: urlOf(tab), title: titleOf(tab) }
  yield* state.spaceFavorites.update((favorites) =>
    updateFavoritesOf(favorites, spaceId, (list) =>
      insertFavorite(
        list,
        favorite,
        Option.getOrElse(index, () => list.length),
      ),
    ),
  )
  yield* state.favoriteTabs.update((bindings) => bindTab(bindings, tabId, favorite.id))
  yield* state.workspace.update((workspace) => forgetTab(workspace, tabId))
  yield* settleFavoritePinsIn(tab.windowId)
})

/** Moves the Favorite to `toIndex` among its Space's, and its tabs to the matching place. */
export const moveFavoriteTo = Effect.fnUntraced(function* (
  favoriteId: FavoriteId,
  toIndex: number,
) {
  const state = yield* KatipState
  const found = findFavorite(yield* state.spaceFavorites.get, favoriteId)
  if (Option.isNone(found)) return
  yield* state.spaceFavorites.update((favorites) =>
    updateFavoritesOf(favorites, found.value.spaceId, (list) =>
      moveFavorite(list, favoriteId, toIndex),
    ),
  )
  yield* settleFavoritePins
})

/** Makes the Favorites' tabs temporary tabs of the Space, unpinned in Chrome. */
export const releaseFavoriteTabs = Effect.fnUntraced(function* (
  tabIds: ReadonlyArray<TabId>,
  spaceId: SpaceId,
) {
  const state = yield* KatipState
  const tabs = yield* Tabs
  const open = Array.getSomes(
    yield* Effect.forEach(tabIds, (tabId) => Effect.option(tabs.get(tabId))),
  )
  const now = yield* Clock.currentTimeMillis
  yield* state.favoriteTabs.update((bindings) =>
    open.reduce((acc, tab) => unbindTab(acc, tab.id), bindings),
  )
  yield* state.workspace.update((workspace) =>
    open.reduce((acc, tab) => assignTab(acc, tab.id, spaceId, now), workspace),
  )
  yield* Effect.forEach(
    open.filter((tab) => tab.pinned),
    (tab) => Effect.ignore(tabs.update(tab.id, { pinned: false })),
    { discard: true },
  )
})

/**
 * Removes the Favorite. Its open tabs stay open but are no longer pinned, as temporary tabs of the
 * Favorite's Space.
 */
export const removeFavoriteAndUnpin = Effect.fnUntraced(function* (favoriteId: FavoriteId) {
  const state = yield* KatipState
  const found = findFavorite(yield* state.spaceFavorites.get, favoriteId)
  if (Option.isNone(found)) return
  const tabIds = tabsOfFavorite(yield* state.favoriteTabs.get, favoriteId)
  yield* state.spaceFavorites.update((favorites) =>
    updateFavoritesOf(favorites, found.value.spaceId, (list) => removeFavorite(list, favoriteId)),
  )
  yield* state.favoriteTabs.update((bindings) => unbindFavorite(bindings, favoriteId))
  yield* releaseFavoriteTabs(tabIds, found.value.spaceId)
})

/** Removes the Favorite the tab is open for, if any, as {@link removeFavoriteAndUnpin} does. */
export const removeFavoriteOfTab = Effect.fnUntraced(function* (tabId: TabId) {
  const bound = favoriteOfTab(yield* (yield* KatipState).favoriteTabs.get, tabId)
  if (Option.isSome(bound)) yield* removeFavoriteAndUnpin(bound.value)
})

/** Forgets that the tab is open for a Favorite. The Favorite stays, closed. */
export const releaseFavoriteTab = Effect.fnUntraced(function* (tabId: TabId) {
  const state = yield* KatipState
  if (Option.isNone(favoriteOfTab(yield* state.favoriteTabs.get, tabId))) return
  yield* state.favoriteTabs.update((bindings) => unbindTab(bindings, tabId))
})

export const replaceFavoriteTab = Effect.fnUntraced(function* (oldTabId: TabId, newTabId: TabId) {
  const state = yield* KatipState
  if (Option.isNone(favoriteOfTab(yield* state.favoriteTabs.get, oldTabId))) return
  yield* state.favoriteTabs.update((bindings) => replaceBoundTab(bindings, oldTabId, newTabId))
})

/**
 * Follows a change, that Katip didn't make, to whether a Favorite's tab is pinned: a tab unpinned
 * while its Favorite's Space was shown in its window, or pinned while it wasn't, stops being the
 * Favorite's. The Favorite stays, closed.
 *
 * @param reported - The tab as the change reported it.
 * @returns The tab as it is now, once it is no longer a Favorite's, to be placed as any tab just
 *   pinned or unpinned is. None while it is still a Favorite's, or once it has closed.
 */
// Decided by the tab as it is now, not as reported: Katip pins and unpins Favorites' tabs on
// switching Spaces, and a change reported before a later switch would otherwise read as the
// user's. The window is the reported one for an unpinning, though: Chrome unpins a tab it moves to
// another window while the tab is still in the window it leaves
export const followFavoritePinChange = Effect.fnUntraced(function* (reported: BrowserTab) {
  const state = yield* KatipState
  const spaceId = yield* spaceOfFavoriteTab(reported.id)
  if (Option.isNone(spaceId)) return Option.none<BrowserTab>()
  const current = yield* Effect.option((yield* Tabs).get(reported.id))
  if (Option.isNone(current)) {
    yield* releaseFavoriteTab(reported.id)
    return Option.none<BrowserTab>()
  }
  const tab = current.value
  const workspace = yield* state.workspace.get
  const spaces = yield* state.spaces.get
  const isShownIn = (windowId: WindowId) =>
    Option.contains(shownSpaceOf(workspace, spaces, windowId), spaceId.value)
  const isUnpinnedByOthers = !reported.pinned && !tab.pinned && isShownIn(reported.windowId)
  const isPinnedByOthers = reported.pinned && tab.pinned && !isShownIn(tab.windowId)
  if (!isUnpinnedByOthers && !isPinnedByOthers) return Option.none<BrowserTab>()
  yield* releaseFavoriteTab(tab.id)
  return Option.some(tab)
})

/** Reorders the Favorites to follow a window's pinned tabs after one of them moved there. */
export const followMovedFavoriteTab = Effect.fnUntraced(function* (
  tabId: TabId,
  windowId: WindowId,
) {
  const state = yield* KatipState
  const bindings = yield* state.favoriteTabs.get
  const favoriteId = favoriteOfTab(bindings, tabId)
  if (Option.isNone(favoriteId)) return
  const found = findFavorite(yield* state.spaceFavorites.get, favoriteId.value)
  if (
    Option.isNone(found) ||
    !Option.contains(yield* shownSpaceIn(windowId), found.value.spaceId)
  ) {
    return
  }
  const pinnedTabs = (yield* tabsIn(windowId)).filter((tab) => tab.pinned)
  yield* state.spaceFavorites.update((favorites) =>
    updateFavoritesOf(favorites, found.value.spaceId, (list) =>
      followTabOrder(list, favoriteId.value, openOrderOf(pinnedTabs, bindings, list)),
    ),
  )
})

/**
 * Keeps the Favorite's saved title up to date while its tab shows the Favorite's own page, so the
 * Favorite is named by that page when closed.
 */
export const refreshFavoriteTitle = Effect.fnUntraced(function* (tab: BrowserTab) {
  const state = yield* KatipState
  const favorites = yield* state.spaceFavorites.get
  const found = Option.flatMap(favoriteOfTab(yield* state.favoriteTabs.get, tab.id), (id) =>
    findFavorite(favorites, id),
  )
  const title = Option.getOrNull(tab.title)
  if (
    Option.isNone(found) ||
    title === null ||
    found.value.favorite.url !== urlOf(tab) ||
    found.value.favorite.title === title
  ) {
    return
  }
  const { spaceId, favorite } = found.value
  yield* state.spaceFavorites.update((favorites) =>
    updateFavoritesOf(favorites, spaceId, (list) =>
      list.map((saved) => (saved.id === favorite.id ? { ...saved, title } : saved)),
    ),
  )
})

/**
 * Forgets the Favorites' tabs that closed, and those of Favorites that are gone. A tab still named
 * as the tab of a Favorite every Space shared becomes the tab of its copy in the Space its window
 * shows.
 *
 * @param tabs - Every open tab.
 */
export const keepOpenFavoriteTabs = Effect.fnUntraced(function* (tabs: ReadonlyArray<BrowserTab>) {
  const state = yield* KatipState
  const favorites = yield* state.spaceFavorites.get
  const workspace = yield* state.workspace.get
  const spaces = yield* state.spaces.get
  const windowOf = new Map(tabs.map((tab) => [tab.id, tab.windowId] as const))
  yield* state.favoriteTabs.update((bindings) =>
    keepOpenTabs(bindings, new Set(windowOf.keys())).flatMap((binding) =>
      Option.toArray(
        Option.map(
          resolveFavoriteId(
            favorites,
            binding.favoriteId,
            Option.flatMap(Option.fromUndefinedOr(windowOf.get(binding.tabId)), (windowId) =>
              shownSpaceOf(workspace, spaces, windowId),
            ),
          ),
          (found) => ({ ...binding, favoriteId: found.favorite.id }),
        ),
      ),
    ),
  )
})
