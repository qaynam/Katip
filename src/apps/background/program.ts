import { Effect, Layer, Match, Semaphore, Stream } from "effect"
import { ArchiveRepository } from "#modules/archive"
import { PinnedBookmarks, SpaceFolders } from "#modules/pinned"
import { SettingsRepository } from "#modules/settings"
import { desiredGroupsFor, TabGroupSync } from "#modules/tab-group-sync"
import { takeSnapshot } from "#modules/workspace"
import { Array, Order } from "effect"
import { BrowserEvents, Tabs, type BrowserEvent, type BrowserTab } from "#platform/browser"
import { SIDEBAR_PORT_NAME } from "#protocol"
import { AUTO_ARCHIVE_ALARM, runAutoArchive, scheduleAutoArchive } from "./auto-archive"
import { pruneStaleBindings } from "./bindings"
import { handleBrowserEvent, isBookmarkEvent } from "./browser-event-handler"
import { makeDebounced } from "./debounced"
import { ExtensionInfo } from "./extension-info"
import { initialize } from "./initialize"
import { KatipState, saveRestoreSnapshot } from "./katip-state"
import { runKeyboardCommand } from "./keyboard-commands"
import { runSidebarCommand } from "./sidebar-commands"
import { SidebarHub } from "./sidebar-hub"
import { urlOf } from "./tab-admission"

const byWindowThenIndex = Order.combine(
  Order.mapInput(Order.Number, (tab: BrowserTab) => tab.windowId),
  Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index),
)

const saveSnapshot = Effect.gen(function* () {
  const workspace = yield* (yield* KatipState).workspace.get
  const tabs = Array.sort(yield* (yield* Tabs).query({}), byWindowThenIndex)
  yield* saveRestoreSnapshot(
    takeSnapshot(
      workspace,
      tabs.map((tab) => ({ tabId: tab.id, url: urlOf(tab) })),
    ),
  )
})

// 同期を OFF にしたときは何もしない。既存のグループを解くと、ユーザーが手で整えた
// タブストリップを壊してしまうため
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
        Effect.logWarning("タブグループの同期を一部完了できなかった", error.failures),
      ),
    )
})

const reconcileWithBookmarks = Effect.gen(function* () {
  const state = yield* KatipState
  const folders = yield* SpaceFolders
  yield* state.spaces.updateEffect((spaces) => folders.reconcileSpaces(spaces))
  yield* pruneStaleBindings
})

const logFailure =
  (label: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.asVoid(effect).pipe(Effect.catchCause((cause) => Effect.logError(label, cause)))

/**
 * background の本体。起動時の整合を取った後、ブラウザのイベント・サイドパネルの接続・
 * 設定の変更を処理し続ける。
 *
 * 状態を変える処理はすべて 1 つのセマフォで直列化する。イベントとコマンドが交互に
 * 状態を読み書きすると、片方の変更をもう片方が上書きしてしまうため。
 */
export const program = Effect.gen(function* () {
  const lock = yield* Semaphore.make(1)
  const serialize = Semaphore.withPermits(lock, 1)
  const hub = yield* SidebarHub
  const events = yield* BrowserEvents

  const publishViews = yield* makeDebounced(hub.publish, "30 millis")
  const syncGroups = yield* makeDebounced(serialize(syncTabGroupsIfEnabled), "200 millis")
  const persistSnapshot = yield* makeDebounced(serialize(saveSnapshot), "1 second")
  const afterChange = Effect.all([publishViews, syncGroups, persistSnapshot], { discard: true })
  const reconcileBookmarks = yield* makeDebounced(
    Effect.andThen(serialize(reconcileWithBookmarks), afterChange),
    "100 millis",
  )

  const handleEvent = (event: BrowserEvent) =>
    Match.value(event).pipe(
      Match.tag("AlarmFired", ({ alarm }) =>
        alarm.name === AUTO_ARCHIVE_ALARM ? serialize(runAutoArchive) : Effect.void,
      ),
      Match.tag("CommandTriggered", ({ command, tab }) =>
        serialize(runKeyboardCommand(command, tab)),
      ),
      Match.orElse((other) =>
        isBookmarkEvent(other) ? reconcileBookmarks : serialize(handleBrowserEvent(other)),
      ),
    )

  yield* events.connections.pipe(
    Stream.runForEach((port) =>
      port.name === SIDEBAR_PORT_NAME
        ? Effect.forkScoped(
            hub.serve(port, (command) =>
              Effect.tap(serialize(runSidebarCommand(command)), () => afterChange),
            ),
          )
        : port.disconnect,
    ),
    Effect.forkScoped(),
  )

  // 起動時の整合が失敗しても、処理を止めずに続ける。止めるとサイドパネルもショートカットも
  // 一切応答しなくなり、ユーザーには何が起きたのか分からない
  yield* logFailure("起動時の整合に失敗した")(serialize(initialize))
  yield* logFailure("自動アーカイブの予約に失敗した")(scheduleAutoArchive)
  yield* afterChange

  // 所属の判定は復元レコードの読み込みを前提にするので、イベントは整合を取った後に処理する
  yield* events.events.pipe(
    Stream.runForEach((event) =>
      Effect.andThen(logFailure(`${event._tag} の処理に失敗した`)(handleEvent(event)), afterChange),
    ),
    Effect.forkScoped(),
  )

  yield* (yield* SettingsRepository).changes.pipe(
    Stream.runForEach(() =>
      Effect.andThen(
        logFailure("自動アーカイブの予約に失敗した")(scheduleAutoArchive),
        afterChange,
      ),
    ),
    logFailure("設定の購読が止まった"),
    Effect.forkScoped(),
  )

  return yield* Effect.never
})

/** {@link program} が使うサービスのうち、Chrome API 以外のもの。 */
export const applicationLayer = Layer.mergeAll(SidebarHub.layer).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      KatipState.layer,
      PinnedBookmarks.layer,
      SettingsRepository.layer,
      ArchiveRepository.layer,
      TabGroupSync.layer,
    ),
  ),
)

export { ExtensionInfo }
