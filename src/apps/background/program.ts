import {
  Clock,
  Context,
  type Duration,
  Effect,
  Layer,
  Match,
  Option,
  Ref,
  Schema,
  Semaphore,
  Stream,
} from "effect"
import { ArchiveRepository } from "#modules/archive"
import { LiveFolders, originPatternOf } from "#modules/live-folders"
import { PinnedBookmarks, SpaceFolders } from "#modules/pinned"
import { PageShortcutSettings, SettingsRepository } from "#modules/settings"
import { desiredGroupsFor, TabGroupSync } from "#modules/tab-group-sync"
import { takeSnapshot } from "#modules/workspace"
import { Array, Order } from "effect"
import { BrowserEvents, Tabs, type BrowserEvent, type BrowserTab } from "#platform/browser"
import { Permissions } from "#platform/permissions"
import { PAGE_SHORTCUT_PORT_NAME, SIDEBAR_PORT_NAME, SPOTLIGHT_PORT_NAME } from "#protocol"
import { AUTO_ARCHIVE_ALARM, runAutoArchive, scheduleAutoArchive } from "./auto-archive"
import { pruneStaleBindings } from "./bindings"
import { handleBrowserEvent, isBookmarkEvent } from "./browser-event-handler"
import { makeDebounced } from "./debounced"
import { AcceptsExternalConnection } from "./external-connection"
import { ExtensionInfo } from "./extension-info"
import { initialize } from "./initialize"
import { KatipState, saveRestoreSnapshot } from "./katip-state"
import {
  LIVE_FOLDER_REFRESH_ALARM,
  refreshDueLiveFolders,
  refreshLiveFoldersWhere,
  scheduleLiveFolderRefresh,
} from "./live-folder-refresh"
import { runKeyboardCommand } from "./keyboard-commands"
import { makePageShortcutServer } from "./page-shortcut-requests"
import { makePageShortcutSync } from "./page-shortcut-sync"
import { runSidebarCommand } from "./sidebar-commands"
import { SidebarHub } from "./sidebar-hub"
import { runSpotlightChoice } from "./spotlight-choice"
import { SpotlightHub } from "./spotlight-hub"
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

const WINDOW_CLOSING_QUIET_MS = 5_000

/** 状態を変える 1 回の処理に許す時間。 */
export const OperationTimeLimit = Context.Reference<Duration.Input>(
  "katip/background/OperationTimeLimit",
  { defaultValue: () => "10 seconds" },
)

/**
 * background の本体。起動時の整合を取った後、ブラウザのイベント・サイドパネルの接続・
 * 設定の変更を処理し続ける。
 *
 * 状態を変える処理はすべて 1 つのセマフォで直列化する。イベントとコマンドが交互に
 * 状態を読み書きすると、片方の変更をもう片方が上書きしてしまうため。
 */
export const program = Effect.gen(function* () {
  const lock = yield* Semaphore.make(1)
  const timeLimit = yield* OperationTimeLimit
  // 状態を変える処理は 1 つずつしか進まないので、Chrome の API 呼び出しが 1 つでも返って
  // こないと、タブの切り替えも含めて以降のすべての操作が詰まる。時間を超えたら打ち切って
  // ロックを手放し、次の操作へ進める
  const serialize = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Semaphore.withPermits(lock, 1)(Effect.timeout(effect, timeLimit))
  const hub = yield* SidebarHub
  const spotlight = yield* SpotlightHub
  const events = yield* BrowserEvents
  const syncPageShortcuts = yield* makePageShortcutSync
  const servePageShortcut = yield* makePageShortcutServer

  const publishViews = yield* makeDebounced(hub.publish, "30 millis")
  const syncGroups = yield* makeDebounced(serialize(syncTabGroupsIfEnabled), "200 millis")
  // ブラウザを終了すると、全タブについてウィンドウを閉じたことによる TabRemoved が届く。
  // その後で記録を取り直すと、再起動時に必要な記録が空で上書きされ、開き直したタブが
  // ピンや Space に戻れなくなる。ウィンドウを閉じた直後は記録を取り直さず、直前の記録を残す
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

  // 取得は状態を変える処理のロックの外で進むので、始まりと終わりを表示へ知らせる。
  // 取得はサイドパネルの接続を受けた直後から始まりうるので、接続を受け付けるより前に購読する
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
      // 拡張機能を更新すると、開いているページに入れたスクリプトは background に接続できなくなる
      Match.tag("RuntimeInstalled", (installed) =>
        Effect.andThen(
          serialize(handleBrowserEvent(installed)),
          installed.reason === "update"
            ? logFailure("ページのショートカットを入れ直せなかった")(syncPageShortcuts("Always"))
            : Effect.void,
        ),
      ),
      Match.orElse((other) =>
        isBookmarkEvent(other) ? reconcileBookmarks : serialize(handleBrowserEvent(other)),
      ),
    )

  const refreshLiveFoldersOnOpen = logFailure("ライブフォルダの取得を始められなかった")(
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
                      Effect.as(Effect.logError("コマンドが時間内に終わらなかった", command), {
                        _tag: "Failed" as const,
                        reason: "時間内に完了しませんでした",
                      }),
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
                      Effect.as(Effect.logError("Spotlight の決定が時間内に終わらなかった"), {
                        _tag: "Failed" as const,
                        reason: "時間内に完了しませんでした",
                      }),
                    ),
                    Effect.tap(() => afterChange),
                  ),
                ),
              )
            : port.name === PAGE_SHORTCUT_PORT_NAME
              ? Effect.forkScoped(servePageShortcut(port))
              : port.disconnect,
    ),
    Effect.forkScoped(),
  )

  // 起動時の整合が失敗しても、処理を止めずに続ける。止めるとサイドパネルもショートカットも
  // 一切応答しなくなり、ユーザーには何が起きたのか分からない
  yield* logFailure("起動時の整合に失敗した")(serialize(initialize))
  yield* logFailure("自動アーカイブの予約に失敗した")(scheduleAutoArchive)
  yield* logFailure("ライブフォルダの取得の予約に失敗した")(scheduleLiveFolderRefresh)
  yield* afterChange

  // 許可されたら、許可を待って失敗していたライブフォルダをすぐに取得し直す。取り消されたら、
  // 次の定期取得を待たずに許可が無いことを示す
  yield* (yield* Permissions).originChanges.pipe(
    Stream.runForEach(({ origins }) =>
      logFailure("ライブフォルダの取得を始められなかった")(
        serialize(refreshLiveFoldersWhere((source) => origins.includes(originPatternOf(source)))),
      ),
    ),
    Effect.forkScoped,
  )

  // 所属の判定は復元レコードの読み込みを前提にするので、イベントは整合を取った後に処理する
  yield* events.events.pipe(
    Stream.runForEach((event) =>
      Effect.andThen(logFailure(`${event._tag} の処理に失敗した`)(handleEvent(event)), afterChange),
    ),
    Effect.forkScoped(),
  )

  // 購読した時点の設定も流れるので、起動時の同期も兼ねる
  yield* (yield* SettingsRepository).changes.pipe(
    Stream.map((settings) => settings.pageShortcuts),
    Stream.changesWith(Schema.toEquivalence(PageShortcutSettings)),
    Stream.runForEach(() =>
      logFailure("ページのショートカットを同期できなかった")(syncPageShortcuts("WhenNewlyEnabled")),
    ),
    logFailure("ページのショートカットの設定の購読が止まった"),
    Effect.forkScoped(),
  )

  // すべてのサイトへのアクセスは設定画面で求めるので、許可の変化でも有効なショートカットが変わる
  yield* (yield* Permissions).originChanges.pipe(
    Stream.runForEach(() =>
      logFailure("ページのショートカットを同期できなかった")(syncPageShortcuts("WhenNewlyEnabled")),
    ),
    Effect.forkScoped,
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
export const applicationLayer = Layer.mergeAll(SidebarHub.layer, SpotlightHub.layer).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      KatipState.layer,
      PinnedBookmarks.layer,
      SettingsRepository.layer,
      ArchiveRepository.layer,
      TabGroupSync.layer,
      LiveFolders.layer,
    ),
  ),
)

export { ExtensionInfo }
