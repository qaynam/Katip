import { Array, Effect, Match, Option, pipe } from "effect"
import { SettingsRepository } from "#modules/settings"
import { trackedTab } from "#modules/workspace"
import { Tabs, Windows, type BrowserTab, type TabId } from "#platform/browser"
import type { PinnedNodeView, SidebarView } from "#protocol"
import { copyTabWithNotice, type CopyFormat } from "./copy-tab"
import { KatipState } from "./katip-state"
import { runSidebarCommand } from "./sidebar-commands"
import { buildSidebarView } from "./sidebar-view-source"
import { openSpotlight } from "./spotlight-window"

export const KeyboardCommand = {
  quickPinToggle: "quick-pin-toggle",
  nextTabInSpace: "next-tab-in-space",
  previousTabInSpace: "previous-tab-in-space",
  copyCurrentUrl: "copy-current-url",
  copyCurrentUrlAsMarkdown: "copy-current-url-as-markdown",
  openSpotlight: "open-spotlight",
} as const

const openTabIdsIn = (nodes: ReadonlyArray<PinnedNodeView>): ReadonlyArray<TabId> =>
  nodes.flatMap((node): ReadonlyArray<TabId> =>
    Match.valueTags(node, {
      PinnedItem: ({ openTab }) => (openTab === null ? [] : [openTab.tab.tabId]),
      PinnedSplit: ({ items }) => openTabIdsIn(items),
      PinnedLiveFolder: () => [],
      PinnedFolder: ({ children }) => openTabIdsIn(children),
    }),
  )

// Not the internal order: with new tabs placed on top, "next" would move up the screen
const tabsInDisplayOrder = (view: SidebarView): ReadonlyArray<TabId> =>
  pipe(
    Array.findFirst(view.spaces, (space) => space.id === view.activeSpaceId),
    Option.match({
      onNone: () => [],
      onSome: (space) => [
        ...(space.pinned._tag === "Available" ? openTabIdsIn(space.pinned.nodes) : []),
        ...space.temporaryEntries.flatMap((entry) =>
          entry._tag === "TemporaryTab" ? [entry.tab.tabId] : entry.tabs.map((tab) => tab.tabId),
        ),
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

// A copy shortcut turned off in the settings keeps its key: extensions cannot unassign the keys
// Chrome gave their commands, so the command still arrives and is ignored here
const copyIfTurnedOn = Effect.fnUntraced(function* (activeTab: BrowserTab, format: CopyFormat) {
  const { pageShortcuts } = yield* (yield* SettingsRepository).get
  const isTurnedOn = format === "Url" ? pageShortcuts.copyUrl : pageShortcuts.copyMarkdownLink
  if (isTurnedOn) yield* copyTabWithNotice(activeTab, format)
})

// Also opens over the last focused window when pressed in a window without tabs, such as devtools
const openSpotlightFrom = (activeTab: Option.Option<BrowserTab>) =>
  Effect.flatMap(
    Option.match(activeTab, {
      onSome: (tab) => Effect.succeed(tab.windowId),
      onNone: () => Windows.use((windows) => Effect.map(windows.getLastFocused, ({ id }) => id)),
    }),
    openSpotlight,
  )

/**
 * Runs a keyboard shortcut. Works whether or not the side panel is open.
 *
 * @remarks
 * The copy shortcuts do nothing unless they are turned on in the settings.
 *
 * @param activeTab - The tab that was active when the shortcut was pressed.
 */
export const runKeyboardCommand = (command: string, activeTab: Option.Option<BrowserTab>) =>
  Match.value(command).pipe(
    Match.when(KeyboardCommand.openSpotlight, () => openSpotlightFrom(activeTab)),
    Match.orElse(() =>
      Option.match(activeTab, {
        onNone: () => Effect.void,
        onSome: (tab) =>
          Match.value(command).pipe(
            Match.when(KeyboardCommand.quickPinToggle, () => togglePin(tab)),
            Match.when(KeyboardCommand.nextTabInSpace, () => stepWithinSpace(tab, 1)),
            Match.when(KeyboardCommand.previousTabInSpace, () => stepWithinSpace(tab, -1)),
            Match.when(KeyboardCommand.copyCurrentUrl, () => copyIfTurnedOn(tab, "Url")),
            Match.when(KeyboardCommand.copyCurrentUrlAsMarkdown, () =>
              copyIfTurnedOn(tab, "MarkdownLink"),
            ),
            Match.orElse(() => Effect.void),
          ),
      }),
    ),
  )
