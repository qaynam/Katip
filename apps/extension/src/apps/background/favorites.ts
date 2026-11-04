import { Array, Clock, Effect, Option, Order } from "effect"
import {
  bindTab,
  claimFavoriteRecord,
  favoriteById,
  FavoriteId,
  favoriteOfTab,
  followTabOrder,
  indexBetween,
  insertFavorite,
  keepOpenTabs,
  moveFavorite,
  pinnedIndexOf,
  removeFavorite,
  replaceBoundTab,
  tabsOfFavorite,
  unbindFavorite,
  unbindTab,
  type FavoriteTabs,
} from "#modules/favorites"
import { Tabs, type BrowserTab, type TabId, type WindowId } from "#platform/browser"
import { KatipState } from "./katip-state"
import { urlOf } from "./tab-admission"

const byIndex = Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index)

export const newFavoriteId = Effect.sync(() => FavoriteId.make(crypto.randomUUID()))

const titleOf = (tab: BrowserTab) => Option.getOrElse(tab.title, () => urlOf(tab))

const pinnedTabsIn = (windowId: WindowId) =>
  Effect.map(
    Tabs.use((tabs) => tabs.query({ windowId, pinned: true })),
    (tabs) => Array.sort(tabs, byIndex),
  )

/** The Favorites open among `pinnedTabs`, in the order of their tabs. */
const openOrderOf = (pinnedTabs: ReadonlyArray<BrowserTab>, bindings: FavoriteTabs) =>
  pinnedTabs.flatMap((tab) => Option.toArray(favoriteOfTab(bindings, tab.id)))

const claimRestored = Effect.fnUntraced(function* (
  url: string,
  isWanted: (favoriteId: FavoriteId) => boolean,
) {
  const state = yield* KatipState
  const queue = yield* state.favoriteRestoreQueue.get
  if (queue === null) return Option.none<FavoriteId>()
  const claimed = claimFavoriteRecord(queue, url, yield* Clock.currentTimeMillis, isWanted)
  if (Option.isNone(claimed)) return Option.none<FavoriteId>()
  const [favoriteId, rest] = claimed.value
  yield* state.favoriteRestoreQueue.update(() => rest)
  return Option.some(favoriteId)
})

/**
 * Makes a tab pinned in Chrome the tab of a Favorite: the one it was the tab of before a restart,
 * else one with the same URL that isn't open in its window yet, else a new Favorite placed among
 * the Favorites of the pinned tabs beside it.
 *
 * Does nothing to a tab that is already a Favorite's, and waits for a tab without a URL yet.
 */
export const adoptPinnedTab = Effect.fnUntraced(function* (tab: BrowserTab) {
  const state = yield* KatipState
  const url = urlOf(tab)
  const bindings = yield* state.favoriteTabs.get
  if (!tab.pinned || url === "" || Option.isSome(favoriteOfTab(bindings, tab.id))) return
  const list = yield* state.favorites.get
  const pinnedTabs = yield* pinnedTabsIn(tab.windowId)
  const openHere = new Set(openOrderOf(pinnedTabs, bindings))
  const isWanted = (favoriteId: FavoriteId) =>
    !openHere.has(favoriteId) && Option.isSome(favoriteById(list, favoriteId))
  const existing = Option.orElse(yield* claimRestored(url, isWanted), () =>
    Option.map(
      Array.findFirst(list, (favorite) => favorite.url === url && isWanted(favorite.id)),
      (favorite) => favorite.id,
    ),
  )
  const favoriteId = yield* Option.match(existing, {
    onSome: Effect.succeed,
    onNone: () =>
      Effect.gen(function* () {
        const position = pinnedTabs.findIndex((pinned) => pinned.id === tab.id)
        const nearestOpen = (side: ReadonlyArray<BrowserTab>) =>
          Array.findFirst(side, (pinned) => favoriteOfTab(bindings, pinned.id))
        const before = nearestOpen(position < 0 ? [] : pinnedTabs.slice(0, position).reverse())
        const after = nearestOpen(position < 0 ? [] : pinnedTabs.slice(position + 1))
        const favorite = { id: yield* newFavoriteId, url, title: titleOf(tab) }
        yield* state.favorites.update((current) =>
          insertFavorite(current, favorite, indexBetween(current, before, after)),
        )
        return favorite.id
      }),
  })
  yield* state.favoriteTabs.update((current) => bindTab(current, tab.id, favoriteId))
})

/** Moves the Favorite's tab to its place among the window's pinned tabs. */
const moveToPlace = Effect.fnUntraced(function* (tab: BrowserTab, favoriteId: FavoriteId) {
  const state = yield* KatipState
  const list = yield* state.favorites.get
  const bindings = yield* state.favoriteTabs.get
  const others = (yield* pinnedTabsIn(tab.windowId)).filter((pinned) => pinned.id !== tab.id)
  const index = pinnedIndexOf(list, favoriteId, new Set(openOrderOf(others, bindings)))
  yield* Tabs.use((tabs) => tabs.move([tab.id], { index }))
})

/**
 * Activates the Favorite's tab in the window, opening it there at its place among the pinned tabs
 * when it is closed.
 *
 * @returns false when the Favorite no longer exists.
 */
export const openFavorite = Effect.fnUntraced(function* (
  windowId: WindowId,
  favoriteId: FavoriteId,
) {
  const state = yield* KatipState
  const tabs = yield* Tabs
  const list = yield* state.favorites.get
  const favorite = favoriteById(list, favoriteId)
  if (Option.isNone(favorite)) return false
  const bindings = yield* state.favoriteTabs.get
  const pinnedTabs = yield* pinnedTabsIn(windowId)
  const open = Array.findFirst(pinnedTabs, (tab) =>
    Option.contains(favoriteOfTab(bindings, tab.id), favoriteId),
  )
  if (Option.isSome(open)) {
    yield* tabs.update(open.value.id, { active: true })
    return true
  }
  const index = pinnedIndexOf(list, favoriteId, new Set(openOrderOf(pinnedTabs, bindings)))
  const created = yield* tabs.create({ windowId, url: favorite.value.url, pinned: true, index })
  yield* state.favoriteTabs.update((current) => bindTab(current, created.id, favoriteId))
  return true
})

/**
 * Saves the tab as a Favorite at `index` and pins it in Chrome. A tab that is already a
 * Favorite's moves its Favorite to `index` instead.
 */
export const addToFavorites = Effect.fnUntraced(function* (
  tabId: TabId,
  index: Option.Option<number>,
) {
  const state = yield* KatipState
  const tabs = yield* Tabs
  const bound = favoriteOfTab(yield* state.favoriteTabs.get, tabId)
  if (Option.isSome(bound)) {
    if (Option.isSome(index)) yield* moveFavoriteTo(bound.value, index.value)
    return
  }
  const tab = yield* tabs.get(tabId)
  const favorite = { id: yield* newFavoriteId, url: urlOf(tab), title: titleOf(tab) }
  yield* state.favorites.update((list) =>
    insertFavorite(
      list,
      favorite,
      Option.getOrElse(index, () => list.length),
    ),
  )
  yield* state.favoriteTabs.update((bindings) => bindTab(bindings, tabId, favorite.id))
  if (!tab.pinned) yield* tabs.update(tabId, { pinned: true })
  yield* moveToPlace(tab, favorite.id)
})

/** Moves the Favorite to `toIndex`, and its tabs to the matching place in every window. */
export const moveFavoriteTo = Effect.fnUntraced(function* (
  favoriteId: FavoriteId,
  toIndex: number,
) {
  const state = yield* KatipState
  yield* state.favorites.update((list) => moveFavorite(list, favoriteId, toIndex))
  const tabIds = tabsOfFavorite(yield* state.favoriteTabs.get, favoriteId)
  const open = Array.getSomes(
    yield* Effect.forEach(tabIds, (tabId) => Effect.option(Tabs.use((tabs) => tabs.get(tabId)))),
  )
  yield* Effect.forEach(open, (tab) => moveToPlace(tab, favoriteId), { discard: true })
})

/**
 * Removes the Favorite. Its open tabs stay open but are no longer pinned, so each becomes a
 * temporary tab of the Space shown in its window.
 */
export const removeFavoriteAndUnpin = Effect.fnUntraced(function* (favoriteId: FavoriteId) {
  const state = yield* KatipState
  const tabs = yield* Tabs
  const tabIds = tabsOfFavorite(yield* state.favoriteTabs.get, favoriteId)
  yield* state.favorites.update((list) => removeFavorite(list, favoriteId))
  yield* state.favoriteTabs.update((bindings) => unbindFavorite(bindings, favoriteId))
  yield* Effect.forEach(tabIds, (tabId) => Effect.ignore(tabs.update(tabId, { pinned: false })), {
    discard: true,
  })
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

/** Reorders the Favorites to follow a window's pinned tabs after one of them moved there. */
export const followMovedFavoriteTab = Effect.fnUntraced(function* (
  tabId: TabId,
  windowId: WindowId,
) {
  const state = yield* KatipState
  const bindings = yield* state.favoriteTabs.get
  const favoriteId = favoriteOfTab(bindings, tabId)
  if (Option.isNone(favoriteId)) return
  const order = openOrderOf(yield* pinnedTabsIn(windowId), bindings)
  yield* state.favorites.update((list) => followTabOrder(list, favoriteId.value, order))
})

/**
 * Keeps the Favorite's saved title up to date while its tab shows the Favorite's own page, so the
 * Favorite is named by that page when closed.
 */
export const refreshFavoriteTitle = Effect.fnUntraced(function* (tab: BrowserTab) {
  const state = yield* KatipState
  const list = yield* state.favorites.get
  const favorite = Option.flatMap(favoriteOfTab(yield* state.favoriteTabs.get, tab.id), (id) =>
    favoriteById(list, id),
  )
  const title = Option.getOrNull(tab.title)
  if (
    Option.isNone(favorite) ||
    title === null ||
    favorite.value.url !== urlOf(tab) ||
    favorite.value.title === title
  ) {
    return
  }
  yield* state.favorites.update((list) =>
    list.map((saved) => (saved.id === favorite.value.id ? { ...saved, title } : saved)),
  )
})

/**
 * Brings the Favorites' tabs in line with the open tabs: forgets the tabs that closed or stopped
 * being pinned, and adopts the pinned tabs that aren't a Favorite's yet.
 *
 * @param tabs - Every open tab, ordered by window and then by tab index.
 */
export const reconcileFavoriteTabs = Effect.fnUntraced(function* (tabs: ReadonlyArray<BrowserTab>) {
  const pinned = tabs.filter((tab) => tab.pinned)
  yield* KatipState.use((state) =>
    state.favoriteTabs.update((bindings) =>
      keepOpenTabs(bindings, new Set(pinned.map((tab) => tab.id))),
    ),
  )
  yield* Effect.forEach(pinned, adoptPinnedTab, { discard: true })
})
