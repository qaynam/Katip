import {
  Clock,
  Context,
  type Duration,
  Effect,
  Layer,
  Match,
  Option,
  Ref,
  Semaphore,
  Stream,
} from "effect"
import { ArchiveRepository } from "#modules/archive"
import { BangCatalog } from "#modules/bangs"
import { takeFavoriteSnapshot } from "#modules/favorites"
import { LiveFolders, originPatternOf } from "#modules/live-folders"
import { PinnedBookmarks, SpaceFolders } from "#modules/pinned"
import { SettingsRepository } from "#modules/settings"
import { SiteCommands } from "#modules/site-commands"
import { desiredGroupsFor, TabGroupSync } from "#modules/tab-group-sync"
import { takeSnapshot } from "#modules/workspace"
import { Array, Order } from "effect"
import { BrowserEvents, Tabs, type BrowserEvent, type BrowserTab } from "#platform/browser"
import { Permissions } from "#platform/permissions"
import {
  EXPORT_PORT_NAME,
  IMPORT_PORT_NAME,
  SIDEBAR_PORT_NAME,
  SPOTLIGHT_PORT_NAME,
} from "#protocol"
import { AUTO_ARCHIVE_ALARM, runAutoArchive, scheduleAutoArchive } from "./auto-archive"
import { pruneStaleBindings } from "./bindings"
import { handleBrowserEvent, isBookmarkEvent } from "./browser-event-handler"
import { exportFileContent, serveDataExport } from "./data-export"
import { serveDataImport } from "./data-import"
import { makeDebounced } from "./debounced"
import { AcceptsExternalConnection } from "./external-connection"
import { ExtensionInfo } from "./extension-info"
import { initialize } from "./initialize"
import { KatipState, saveFavoriteRestoreSnapshot, saveRestoreSnapshot } from "./katip-state"
import {
  LIVE_FOLDER_REFRESH_ALARM,
  refreshDueLiveFolders,
  refreshLiveFoldersWhere,
  scheduleLiveFolderRefresh,
} from "./live-folder-refresh"
import { runKeyboardCommand } from "./keyboard-commands"
import { runSidebarCommand } from "./sidebar-commands"
import { SidebarHub } from "./sidebar-hub"
import { runSpotlightChoice } from "./spotlight-choice"
import { SpotlightHub } from "./spotlight-hub"
import { urlOf } from "./tab-admission"
import { numberedSpaceName, translate } from "./translation"

const byWindowThenIndex = Order.combine(
  Order.mapInput(Order.Number, (tab: BrowserTab) => tab.windowId),
  Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index),
)

const saveSnapshot = Effect.gen(function* () {
  const state = yield* KatipState
  const tabs = Array.sort(yield* (yield* Tabs).query({}), byWindowThenIndex)
  const liveTabs = tabs.map((tab) => ({ tabId: tab.id, url: urlOf(tab) }))
  yield* saveRestoreSnapshot(takeSnapshot(yield* state.workspace.get, liveTabs))
  yield* saveFavoriteRestoreSnapshot(takeFavoriteSnapshot(yield* state.favoriteTabs.get, liveTabs))
})

// Existing groups are left alone when syncing is off: ungrouping them would wreck a tab strip the
// user arranged by hand
const syncTabGroupsIfEnabled = Effect.gen(function* () {
  const settings = yield* (yield* SettingsRepository).get
  if (!settings.syncTabGroups) return
  const state = yield* KatipState
  const desired = desiredGroupsFor(
    yield* state.spaces.get,
    yield* state.workspace.get,
    yield* (yield* Tabs).query({}),
  )
  yield* (yield* TabGroupSync)
    .sync(desired)
    .pipe(
      Effect.catchTag("TabGroupSyncIncomplete", (error) =>
        Effect.logWarning("Couldn't finish part of the tab group sync", error.failures),
      ),
    )
})

const reconcileWithBookmarks = Effect.gen(function* () {
  const state = yield* KatipState
  const folders = yield* SpaceFolders
  const numbered = yield* numberedSpaceName
  yield* state.spaces.updateEffect((spaces) => folders.reconcileSpaces(spaces, numbered))
  yield* pruneStaleBindings
})

const timedOut = Effect.map(translate("background.operation.timedOut"), (reason) => ({
  _tag: "Failed" as const,
  reason,
}))

const logFailure =
  (label: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.asVoid(effect).pipe(Effect.catchCause((cause) => Effect.logError(label, cause)))

const WINDOW_CLOSING_QUIET_MS = 5_000

/** How long a single state-changing operation may take. */
export const OperationTimeLimit = Context.Reference<Duration.Input>(
  "katip/background/OperationTimeLimit",
  { defaultValue: () => "10 seconds" },
)

/**
 * The background itself. After reconciling at startup, it keeps handling browser events, side
 * panel connections, and settings changes.
 *
 * Every state-changing operation is serialized by one semaphore: if events and commands read and
 * wrote the state interleaved, one would overwrite the other's changes.
 */
export const program = Effect.gen(function* () {
  const lock = yield* Semaphore.make(1)
  const timeLimit = yield* OperationTimeLimit
  // State-changing operations run one at a time, so a single Chrome API call that never returns
  // would block every later operation, switching tabs included. Past the time limit the operation
  // is cut off and lets go of the lock, so the next one can run
  const serialize = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Semaphore.withPermits(lock, 1)(Effect.timeout(effect, timeLimit))
  const hub = yield* SidebarHub
  const spotlight = yield* SpotlightHub
  const events = yield* BrowserEvents

  const publishViews = yield* makeDebounced(hub.publish, "30 millis")
  const syncGroups = yield* makeDebounced(serialize(syncTabGroupsIfEnabled), "200 millis")
  // Quitting the browser sends a TabRemoved for every tab, marked as closed with its window. A
  // snapshot taken after that would overwrite the one needed at restart with an empty one, and
  // the reopened tabs couldn't return to their pins and Spaces. So right after a window closes,
  // no new snapshot is taken and the previous one is kept
  const lastWindowClosingAt = yield* Ref.make(Number.NEGATIVE_INFINITY)
  const saveSnapshotUnlessClosing = Effect.gen(function* () {
    const sinceClosing = (yield* Clock.currentTimeMillis) - (yield* Ref.get(lastWindowClosingAt))
    if (sinceClosing < WINDOW_CLOSING_QUIET_MS) return
    yield* saveSnapshot
  })
  const persistSnapshot = yield* makeDebounced(serialize(saveSnapshotUnlessClosing), "1 second")
  const afterChange = Effect.all([publishViews, syncGroups, persistSnapshot], { discard: true })
  const reconcileBookmarks = yield* makeDebounced(
    Effect.andThen(serialize(reconcileWithBookmarks), afterChange),
    "100 millis",
  )

  // Refreshes run outside the lock that state-changing operations take, so the views are published
  // whenever one starts or ends. A refresh can start as soon as a side panel connects, so this
  // subscribes before connections are accepted
  yield* (yield* LiveFolders).refreshEvents.pipe(
    Stream.runForEach(() => publishViews),
    Effect.forkScoped,
  )

  const handleEvent = (event: BrowserEvent) =>
    Match.value(event).pipe(
      Match.tag("TabRemoved", (removed) =>
        Effect.andThen(
          removed.isWindowClosing
            ? Effect.flatMap(Clock.currentTimeMillis, (now) => Ref.set(lastWindowClosingAt, now))
            : Effect.void,
          serialize(handleBrowserEvent(removed)),
        ),
      ),
      Match.tag("AlarmFired", ({ alarm }) =>
        Match.value(alarm.name).pipe(
          Match.when(AUTO_ARCHIVE_ALARM, () => serialize(runAutoArchive)),
          Match.when(LIVE_FOLDER_REFRESH_ALARM, () => serialize(refreshDueLiveFolders)),
          Match.orElse(() => Effect.void),
        ),
      ),
      Match.tag("CommandTriggered", ({ command, tab }) =>
        serialize(runKeyboardCommand(command, tab)),
      ),
      Match.orElse((other) =>
        isBookmarkEvent(other) ? reconcileBookmarks : serialize(handleBrowserEvent(other)),
      ),
    )

  const refreshLiveFoldersOnOpen = logFailure("Couldn't start refreshing live folders")(
    serialize(refreshDueLiveFolders),
  )

  const acceptsExternal = yield* AcceptsExternalConnection
  yield* events.connections.pipe(
    Stream.runForEach((port) =>
      Option.exists(port.sender, (sender) => sender.external && !acceptsExternal(sender))
        ? port.disconnect
        : port.name === SIDEBAR_PORT_NAME
          ? Effect.andThen(
              Effect.forkScoped(refreshLiveFoldersOnOpen),
              Effect.forkScoped(
                hub.serve(port, (command) =>
                  serialize(runSidebarCommand(command)).pipe(
                    Effect.catchTag("TimeoutError", () =>
                      Effect.andThen(
                        Effect.logError("A command didn't finish in time", command),
                        timedOut,
                      ),
                    ),
                    Effect.tap(() => afterChange),
                  ),
                ),
              ),
            )
          : port.name === SPOTLIGHT_PORT_NAME
            ? Effect.forkScoped(
                spotlight.serve(port, (windowId, result) =>
                  serialize(runSpotlightChoice(windowId, result)).pipe(
                    Effect.catchTag("TimeoutError", () =>
                      Effect.andThen(
                        Effect.logError("A Spotlight choice didn't finish in time"),
                        timedOut,
                      ),
                    ),
                    Effect.tap(() => afterChange),
                  ),
                ),
              )
            : port.name === EXPORT_PORT_NAME
              ? Effect.forkScoped(serveDataExport(port, serialize(exportFileContent)))
              : port.name === IMPORT_PORT_NAME
                ? Effect.forkScoped(serveDataImport(port, serialize, afterChange))
                : port.disconnect,
    ),
    Effect.forkScoped(),
  )

  // Not stopped when reconciling at startup fails: the side panel and shortcuts would stop
  // responding entirely, and the user couldn't tell what happened
  yield* logFailure("Couldn't reconcile at startup")(serialize(initialize))
  yield* logFailure("Couldn't schedule auto archive")(scheduleAutoArchive)
  yield* logFailure("Couldn't schedule live folder refreshes")(scheduleLiveFolderRefresh)
  yield* afterChange

  // Not left to the next periodic refresh: once access is granted, live folders that failed for
  // lack of it are refreshed at once, and once it's revoked, they show the missing access at once
  yield* (yield* Permissions).originChanges.pipe(
    Stream.runForEach(({ origins }) =>
      logFailure("Couldn't start refreshing live folders")(
        serialize(refreshLiveFoldersWhere((source) => origins.includes(originPatternOf(source)))),
      ),
    ),
    Effect.forkScoped,
  )

  // Events are handled only after reconciling: deciding a tab's Space relies on the restore
  // records having been loaded
  yield* events.events.pipe(
    Stream.runForEach((event) =>
      Effect.andThen(logFailure(`Couldn't handle ${event._tag}`)(handleEvent(event)), afterChange),
    ),
    Effect.forkScoped(),
  )

  yield* (yield* SettingsRepository).changes.pipe(
    Stream.runForEach(() =>
      Effect.andThen(
        logFailure("Couldn't schedule auto archive")(scheduleAutoArchive),
        afterChange,
      ),
    ),
    logFailure("Stopped following settings changes"),
    Effect.forkScoped(),
  )

  return yield* Effect.never
})

/** The services {@link program} uses, apart from the Chrome APIs. */
export const applicationLayer = Layer.mergeAll(SidebarHub.layer, SpotlightHub.layer).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      KatipState.layer,
      PinnedBookmarks.layer,
      SettingsRepository.layer,
      SiteCommands.layer,
      BangCatalog.layer,
      ArchiveRepository.layer,
      TabGroupSync.layer,
      LiveFolders.layer,
    ),
  ),
)

export { ExtensionInfo }
