import { Clock, Effect, Match, Option } from "effect"
import type { Action } from "#modules/actions"
import { activeSpaceOf, assignTab, trackedTab } from "#modules/workspace"
import {
  type BrowserTab,
  Tabs,
  type TabId,
  WebSearch,
  type WindowId,
  Windows,
} from "#platform/browser"
import type { SidebarCommand, SpotlightOutcome, SpotlightResult } from "#protocol"
import { copyTabWithNotice, type CopyFormat } from "./copy-tab"
import { KatipState } from "./katip-state"
import { runSidebarCommand } from "./sidebar-commands"
import { currentTranslator, translate } from "./translation"

const succeeded: SpotlightOutcome = { _tag: "Succeeded" }

const focusWindow = (windowId: WindowId) =>
  Windows.use((windows) => windows.update(windowId, { focused: true }))

const activateTab = Effect.fnUntraced(function* (tabId: TabId) {
  const tab = yield* (yield* Tabs).update(tabId, { active: true })
  yield* focusWindow(tab.windowId)
  return succeeded
})

// ピンを開く・Space を切り替える規則はサイドパネルから操作したときと同じにしたいので、
// 同じコマンドを実行する
const runAsSidebarCommand = Effect.fnUntraced(function* (
  callerWindowId: WindowId,
  command: SidebarCommand,
) {
  const outcome = yield* runSidebarCommand(command)
  if (outcome._tag === "Failed") return outcome satisfies SpotlightOutcome
  yield* focusWindow(callerWindowId)
  return succeeded
})

// タブの所属は作成イベントの処理でも決まるが、その時点でアクティブな Space が変わっていても
// 開いたときの Space に入るよう、ここで所属させる
const openTabInActiveSpace = Effect.fnUntraced(function* (
  callerWindowId: WindowId,
  url: Option.Option<string>,
) {
  const state = yield* KatipState
  const tab = yield* (yield* Tabs).create({
    windowId: callerWindowId,
    active: true,
    ...Option.match(url, { onNone: () => ({}), onSome: (value) => ({ url: value }) }),
  })
  const activeSpaceId = activeSpaceOf(yield* state.workspace.get, callerWindowId)
  if (Option.isSome(activeSpaceId)) {
    const now = yield* Clock.currentTimeMillis
    yield* state.workspace.update((workspace) =>
      assignTab(workspace, tab.id, activeSpaceId.value, now),
    )
  }
  return tab
})

const openUrl = Effect.fnUntraced(function* (callerWindowId: WindowId, url: string) {
  yield* openTabInActiveSpace(callerWindowId, Option.some(url))
  yield* focusWindow(callerWindowId)
  return succeeded
})

const searchWeb = Effect.fnUntraced(function* (callerWindowId: WindowId, query: string) {
  const tab = yield* openTabInActiveSpace(callerWindowId, Option.none())
  yield* (yield* WebSearch).query(query, tab.id)
  yield* focusWindow(callerWindowId)
  return succeeded
})

const failed = (reason: string): SpotlightOutcome => ({ _tag: "Failed", reason })

const finishInCaller = (callerWindowId: WindowId) =>
  Effect.as(focusWindow(callerWindowId), succeeded)

const onActiveTab = Effect.fnUntraced(function* <E, R>(
  callerWindowId: WindowId,
  run: (tab: BrowserTab) => Effect.Effect<SpotlightOutcome, E, R>,
) {
  const [activeTab] = yield* (yield* Tabs).query({ windowId: callerWindowId, active: true })
  if (activeTab === undefined) return failed(yield* translate("background.tab.noTarget"))
  return yield* run(activeTab)
})

const copyActiveTab = (callerWindowId: WindowId, format: CopyFormat) =>
  onActiveTab(callerWindowId, (tab) =>
    Effect.gen(function* () {
      if (yield* copyTabWithNotice(tab, format)) return yield* finishInCaller(callerWindowId)
      return failed((yield* currentTranslator).t("actions.copyFailed"))
    }),
  )

const togglePinOf = Effect.fnUntraced(function* (callerWindowId: WindowId, tab: BrowserTab) {
  const tracked = trackedTab(yield* (yield* KatipState).workspace.get, tab.id)
  const isPinned = Option.exists(tracked, ({ pinned }) => pinned !== null)
  return yield* runAsSidebarCommand(
    callerWindowId,
    isPinned ? { _tag: "UnpinTab", tabId: tab.id } : { _tag: "PinTab", tabId: tab.id },
  )
})

const closeTemporaryTabs = Effect.fnUntraced(function* (callerWindowId: WindowId) {
  const spaceId = activeSpaceOf(yield* (yield* KatipState).workspace.get, callerWindowId)
  if (Option.isNone(spaceId)) {
    return failed(yield* translate("background.spotlight.noActiveSpace"))
  }
  return yield* runAsSidebarCommand(callerWindowId, {
    _tag: "CloseTemporaryTabs",
    windowId: callerWindowId,
    spaceId: spaceId.value,
  })
})

// ピン留め・タブを閉じる・Space へ移すなどは、サイドパネルから操作したときと同じ規則で動かす
const runAction = (callerWindowId: WindowId, action: Action) =>
  Match.valueTags(action, {
    CopyUrl: () => copyActiveTab(callerWindowId, "Url"),
    CopyMarkdownLink: () => copyActiveTab(callerWindowId, "MarkdownLink"),
    TogglePin: () => onActiveTab(callerWindowId, (tab) => togglePinOf(callerWindowId, tab)),
    DuplicateTab: () =>
      onActiveTab(callerWindowId, (tab) =>
        Effect.andThen(
          Tabs.use((tabs) => tabs.duplicate(tab.id)),
          finishInCaller(callerWindowId),
        ),
      ),
    CloseTab: () =>
      onActiveTab(callerWindowId, (tab) =>
        runAsSidebarCommand(callerWindowId, { _tag: "CloseTab", tabId: tab.id }),
      ),
    ToggleMute: () =>
      onActiveTab(callerWindowId, (tab) =>
        Effect.andThen(
          Tabs.use((tabs) => tabs.update(tab.id, { muted: !tab.muted })),
          finishInCaller(callerWindowId),
        ),
      ),
    MoveTabToSpace: ({ spaceId }) =>
      onActiveTab(callerWindowId, (tab) =>
        runAsSidebarCommand(callerWindowId, { _tag: "MoveTabToSpace", tabId: tab.id, spaceId }),
      ),
    CloseTemporaryTabs: () => closeTemporaryTabs(callerWindowId),
    OpenSettings: () => runAsSidebarCommand(callerWindowId, { _tag: "OpenSettings" }),
  })

/**
 * Spotlight で選ばれた候補を開く。`callerWindowId` は Spotlight を開いたウィンドウで、
 * 開いたページはそこへ出し、そのウィンドウを前面に戻す（開いているタブを選んだときはそのタブのウィンドウ）。
 * 操作は、そのウィンドウでアクティブなタブを対象に実行する。
 *
 * @remarks
 * 失敗しない。開けなかったときは理由を `Failed` で返す。
 */
export const runSpotlightChoice = (callerWindowId: WindowId, result: SpotlightResult) =>
  Match.valueTags(result, {
    OpenTab: ({ tabId }) => activateTab(tabId),
    Pin: ({ bookmarkId }) =>
      runAsSidebarCommand(callerWindowId, {
        _tag: "OpenPinnedItem",
        windowId: callerWindowId,
        bookmarkId,
      }),
    Space: ({ spaceId }) =>
      runAsSidebarCommand(callerWindowId, {
        _tag: "SwitchSpace",
        windowId: callerWindowId,
        spaceId,
      }),
    Bookmark: ({ url }) => openUrl(callerWindowId, url),
    History: ({ url }) => openUrl(callerWindowId, url),
    Action: ({ action }) => runAction(callerWindowId, action),
    OpenUrl: ({ url }) => openUrl(callerWindowId, url),
    SearchWeb: ({ query }) => searchWeb(callerWindowId, query),
  }).pipe(
    Effect.catch((error) =>
      Effect.andThen(
        Effect.logWarning("Spotlight の候補を開けなかった", result._tag, error),
        Effect.map(translate("background.spotlight.cannotOpen"), failed),
      ),
    ),
  )
