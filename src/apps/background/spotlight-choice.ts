import { Clock, Effect, Match, Option } from "effect"
import { activeSpaceOf, assignTab } from "#modules/workspace"
import { Tabs, type TabId, WebSearch, type WindowId, Windows } from "#platform/browser"
import type { SidebarCommand, SpotlightOutcome, SpotlightResult } from "#protocol"
import { KatipState } from "./katip-state"
import { runSidebarCommand } from "./sidebar-commands"

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

/**
 * Spotlight で選ばれた候補を開く。`callerWindowId` は Spotlight を開いたウィンドウで、
 * 開いたページはそこへ出し、そのウィンドウを前面に戻す（開いているタブを選んだときはそのタブのウィンドウ）。
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
    OpenUrl: ({ url }) => openUrl(callerWindowId, url),
    SearchWeb: ({ query }) => searchWeb(callerWindowId, query),
  }).pipe(
    Effect.catch((error) =>
      Effect.as(Effect.logWarning("Spotlight の候補を開けなかった", result._tag, error), {
        _tag: "Failed",
        reason: "開けませんでした",
      } satisfies SpotlightOutcome),
    ),
  )
