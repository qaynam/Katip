import { Array, Effect, Match, Option, pipe } from "effect"
import { trackedTab } from "#modules/workspace"
import { Tabs, type BrowserTab, type TabId } from "#platform/browser"
import type { PinnedNodeView, SidebarView } from "#protocol"
import { Clipboard } from "#platform/clipboard"
import { KatipState } from "./katip-state"
import { runSidebarCommand } from "./sidebar-commands"
import { SidebarHub } from "./sidebar-hub"
import { buildSidebarView } from "./sidebar-view-source"
import { urlOf } from "./tab-admission"

export const KeyboardCommand = {
  quickPinToggle: "quick-pin-toggle",
  nextTabInSpace: "next-tab-in-space",
  previousTabInSpace: "previous-tab-in-space",
  copyCurrentUrl: "copy-current-url",
} as const

const openTabIdsIn = (nodes: ReadonlyArray<PinnedNodeView>): ReadonlyArray<TabId> =>
  nodes.flatMap((node) =>
    node._tag === "PinnedFolder"
      ? openTabIdsIn(node.children)
      : node.openTab === null
        ? []
        : [node.openTab.tab.tabId],
  )

// 画面に見えている順で移動する。内部の並びで移動すると、新しいタブを上に出す設定では
// 「次」が画面上で上に進むことになる
const tabsInDisplayOrder = (view: SidebarView): ReadonlyArray<TabId> =>
  pipe(
    Array.findFirst(view.spaces, (space) => space.id === view.activeSpaceId),
    Option.match({
      onNone: () => [],
      onSome: (space) => [
        ...(space.pinned._tag === "Available" ? openTabIdsIn(space.pinned.nodes) : []),
        ...space.temporaryTabs.map((tab) => tab.tabId),
      ],
    }),
  )

const stepWithinSpace = Effect.fnUntraced(function* (activeTab: BrowserTab, step: 1 | -1) {
  const view = yield* buildSidebarView(activeTab.windowId)
  if (Option.isNone(view)) return
  const order = tabsInDisplayOrder(view.value)
  const current = order.indexOf(activeTab.id)
  if (order.length === 0 || current === -1) return
  const next = order[(current + step + order.length) % order.length]
  if (next !== undefined) yield* (yield* Tabs).update(next, { active: true })
})

const togglePin = Effect.fnUntraced(function* (activeTab: BrowserTab) {
  const tracked = trackedTab(yield* (yield* KatipState).workspace.get, activeTab.id)
  if (Option.isNone(tracked)) return
  yield* runSidebarCommand(
    tracked.value.pinned === null
      ? { _tag: "PinTab", tabId: activeTab.id }
      : { _tag: "UnpinTab", tabId: activeTab.id },
  )
})

const copyUrl = Effect.fnUntraced(function* (activeTab: BrowserTab) {
  const url = urlOf(activeTab)
  if (url === "") return
  yield* (yield* Clipboard).writeText(url)
  yield* (yield* SidebarHub).notify("URL をコピーしました")
})

/**
 * キーボードショートカットを実行する。サイドパネルが開いていなくても動く。
 *
 * @param activeTab - ショートカットを押したときにアクティブだったタブ。
 */
export const runKeyboardCommand = (command: string, activeTab: Option.Option<BrowserTab>) =>
  Option.match(activeTab, {
    onNone: () => Effect.void,
    onSome: (tab) =>
      Match.value(command).pipe(
        Match.when(KeyboardCommand.quickPinToggle, () => togglePin(tab)),
        Match.when(KeyboardCommand.nextTabInSpace, () => stepWithinSpace(tab, 1)),
        Match.when(KeyboardCommand.previousTabInSpace, () => stepWithinSpace(tab, -1)),
        Match.when(KeyboardCommand.copyCurrentUrl, () => copyUrl(tab)),
        Match.orElse(() => Effect.void),
      ),
  })
