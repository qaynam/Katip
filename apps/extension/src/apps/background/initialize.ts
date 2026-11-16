import { Array, Clock, Effect, Option, Order } from "effect"
import { carrySharedFavorites } from "#modules/favorites"
import { SpaceFolders } from "#modules/pinned"
import { addSpace, SpaceId, SpaceName, type SpaceList } from "#modules/space"
import {
  activeSpaceOf,
  forgetTab,
  RESTORE_WINDOW_MS,
  spaceOf,
  startRestore,
  switchSpace,
  type Workspace,
} from "#modules/workspace"
import { Storage, Tabs, type BrowserTab, type TabId } from "#platform/browser"
import { pruneStaleBindings } from "./bindings"
import {
  adoptPinnedTab,
  favoriteTabSpaces,
  keepOpenFavoriteTabs,
  restoreUnpinnedFavoriteTab,
} from "./favorites"
import {
  forgetSharedFavorites,
  KatipState,
  loadFavoriteRestoreSnapshot,
  loadRestoreSnapshot,
} from "./katip-state"
import { admitTab } from "./tab-admission"
import { currentTranslator, numberedSpaceName } from "./translation"

export const newSpaceId = Effect.sync(() => SpaceId.make(crypto.randomUUID()))

const ensureAtLeastOneSpace = Effect.fnUntraced(function* (spaces: SpaceList) {
  if (spaces.length > 0) return spaces
  const folders = yield* SpaceFolders
  const home = SpaceName.make((yield* currentTranslator).t("common.home"))
  const withHome = addSpace([], { id: yield* newSpaceId, name: home })
  yield* Effect.forEach(withHome, (space) => folders.ensureSpaceFolder(space))
  return withHome
})

const byWindowThenIndex = Order.combine(
  Order.mapInput(Order.Number, (tab: BrowserTab) => tab.windowId),
  Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index),
)

const forgetClosedTabs = (workspace: Workspace, alive: ReadonlySet<number>) =>
  workspace.tabs
    .filter((tab) => !alive.has(tab.tabId))
    .reduce((acc, tab) => forgetTab(acc, tab.tabId), workspace)

const activateSpacesOfActiveTabs = (
  workspace: Workspace,
  tabs: ReadonlyArray<BrowserTab>,
  favoriteSpaces: ReadonlyMap<TabId, SpaceId>,
): Workspace =>
  tabs
    .filter((tab) => tab.active)
    .reduce(
      (acc, tab) =>
        Option.isSome(activeSpaceOf(acc, tab.windowId))
          ? acc
          : Option.match(
              Option.orElse(spaceOf(acc, tab.id), () =>
                Option.fromUndefinedOr(favoriteSpaces.get(tab.id)),
              ),
              {
                onNone: () => acc,
                onSome: (spaceId) => switchSpace(acc, tab.windowId, spaceId),
              },
            ),
      workspace,
    )

const showSpacesOfActiveTabs = Effect.fnUntraced(function* (tabs: ReadonlyArray<BrowserTab>) {
  const state = yield* KatipState
  const favoriteSpaces = yield* favoriteTabSpaces(tabs)
  yield* state.workspace.update((workspace) =>
    activateSpacesOfActiveTabs(workspace, tabs, favoriteSpaces),
  )
})

/**
 * Copies the Favorites every Space shared, which startup found before there was a Space, into the
 * Spaces there are now.
 */
const carrySharedFavoritesAwaitingSpace = Effect.gen(function* () {
  const state = yield* KatipState
  const shared = state.sharedFavoritesAwaitingSpace
  if (Option.isNone(shared)) return
  const spaceIds = (yield* state.spaces.get).map((space) => space.id)
  yield* state.spaceFavorites.update((favorites) =>
    carrySharedFavorites(favorites, shared.value, spaceIds),
  )
  yield* forgetSharedFavorites((yield* Storage).local)
})

/**
 * Brings the saved state in line with the browser when the service worker starts.
 *
 * Events that arrived while it starts are handled afterwards, in order. A TabCreated arriving
 * later for a tab placed in a Space here isn't handled twice, since the tab already has a Space.
 */
export const initialize = Effect.gen(function* () {
  const state = yield* KatipState
  const folders = yield* SpaceFolders
  const now = yield* Clock.currentTimeMillis

  if (state.isFreshSession) {
    const snapshot = yield* loadRestoreSnapshot
    yield* state.restoreQueue.update(() =>
      Option.getOrNull(Option.map(snapshot, (records) => startRestore(records, now))),
    )
    const favoriteSnapshot = yield* loadFavoriteRestoreSnapshot
    yield* state.favoriteRestoreQueue.update(() =>
      Option.getOrNull(
        Option.map(favoriteSnapshot, (records) => ({
          records,
          expiresAt: now + RESTORE_WINDOW_MS,
        })),
      ),
    )
  }

  const numbered = yield* numberedSpaceName
  yield* state.spaces.updateEffect((spaces) =>
    Effect.flatMap(folders.reconcileSpaces(spaces, numbered), ensureAtLeastOneSpace),
  )

  yield* carrySharedFavoritesAwaitingSpace

  const tabs = Array.sort(yield* (yield* Tabs).query({}), byWindowThenIndex)
  const alive = new Set<number>(tabs.map((tab) => tab.id))
  yield* state.workspace.update((workspace) => forgetClosedTabs(workspace, alive))
  yield* keepOpenFavoriteTabs(tabs)
  // Before the tabs are placed in Spaces, which would take a tab its Favorite left unpinned for a
  // temporary tab
  yield* Effect.forEach(
    tabs.filter((tab) => !tab.pinned),
    restoreUnpinnedFavoriteTab,
    { discard: true },
  )
  yield* Effect.forEach(tabs, admitTab, { discard: true })
  yield* showSpacesOfActiveTabs(tabs)
  // The active pinned tab comes first: the Space of its Favorite is the one its window shows, which
  // the other pinned tabs there are then the Favorites of
  const pinned = tabs.filter((tab) => tab.pinned)
  yield* Effect.forEach(
    pinned.filter((tab) => tab.active),
    adoptPinnedTab,
    { discard: true },
  )
  yield* showSpacesOfActiveTabs(tabs)
  yield* Effect.forEach(
    pinned.filter((tab) => !tab.active),
    adoptPinnedTab,
    { discard: true },
  )
  yield* pruneStaleBindings
})
