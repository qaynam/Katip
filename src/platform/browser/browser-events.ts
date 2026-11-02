import { Context, Layer, Option, Stream } from "effect"
import { fromChromeAlarm } from "./alarm"
import { fromChromeBookmark } from "./bookmark"
import type { BrowserEvent } from "./browser-event"
import {
  type BrowserPort,
  type ChromePort,
  fromChromeMessageSender,
  fromChromePort,
} from "./browser-port"
import { windowIdFrom } from "./chrome-values"
import { makeHeldStream } from "./held-stream"
import { BookmarkId, TabId, WindowId } from "./ids"
import { fromChromeTab, fromChromeTabChangeInfo } from "./tab"
import { fromChromeTabGroup } from "./tab-group"
import { fromChromeWindow } from "./window"

type ListenerOf<Event> = Event extends { addListener(listener: infer Listener): void }
  ? Listener
  : never

interface EventSource<Listener> {
  addListener(listener: Listener): void
}

type EventSourcesOf<Namespace, Name extends keyof Namespace> = {
  readonly [K in Name]: EventSource<ListenerOf<Namespace[K]>>
}

/** The Chrome events {@link captureBrowserEvents} listens to. `chrome` itself fits. */
export interface BrowserEventSources {
  readonly tabs: EventSourcesOf<
    typeof chrome.tabs,
    | "onCreated"
    | "onUpdated"
    | "onRemoved"
    | "onActivated"
    | "onMoved"
    | "onAttached"
    | "onDetached"
    | "onReplaced"
  >
  readonly tabGroups: EventSourcesOf<
    typeof chrome.tabGroups,
    "onCreated" | "onUpdated" | "onRemoved" | "onMoved"
  >
  readonly windows: EventSourcesOf<
    typeof chrome.windows,
    "onCreated" | "onRemoved" | "onFocusChanged"
  >
  readonly bookmarks: EventSourcesOf<
    typeof chrome.bookmarks,
    "onCreated" | "onChanged" | "onMoved" | "onRemoved" | "onChildrenReordered"
  >
  readonly alarms: EventSourcesOf<typeof chrome.alarms, "onAlarm">
  readonly commands: EventSourcesOf<typeof chrome.commands, "onCommand">
  readonly runtime: EventSourcesOf<typeof chrome.runtime, "onInstalled" | "onStartup"> & {
    readonly onConnect: EventSource<(port: ChromePort) => void>
    readonly onConnectExternal: EventSource<(port: ChromePort) => void>
  }
}

export interface CapturedBrowserEvents {
  /**
   * Events that happened in the browser.
   *
   * @remarks
   * Events that arrive before the first subscriber are held and delivered to that subscriber only.
   * Later subscribers receive only events after they subscribe, so to handle the event that woke
   * the service worker in several places, fan it out from a single subscription.
   */
  readonly events: Stream.Stream<BrowserEvent>
  /**
   * Accepted Port connections (`runtime.onConnect` and `runtime.onConnectExternal`), held the same
   * way as `events`.
   */
  readonly connections: Stream.Stream<BrowserPort>
}

/**
 * Registers every Chrome event listener and holds incoming events until a subscriber arrives.
 *
 * @remarks
 * In a service worker, call this synchronously at module top level, before building any Layer.
 * Calling it twice in one page delivers each event to both {@link CapturedBrowserEvents}.
 */
export const captureBrowserEvents = (sources: BrowserEventSources): CapturedBrowserEvents => {
  const events = makeHeldStream<BrowserEvent>()
  const connections = makeHeldStream<BrowserPort>()
  const emit = (event: BrowserEvent) => events.push(event)
  const emitWhenPresent = <A>(value: Option.Option<A>, toEvent: (value: A) => BrowserEvent) => {
    if (Option.isSome(value)) emit(toEvent(value.value))
  }

  // Not registered on subscription with Stream.callback: that would miss the event that woke the
  // service worker while Layers are built and storage is read. MV3 delivers that event only to
  // listeners registered synchronously while the script is evaluated, so all of them are registered
  // here and their events held.
  sources.tabs.onCreated.addListener((raw) =>
    emitWhenPresent(fromChromeTab(raw), (tab) => ({ _tag: "TabCreated", tab })),
  )
  sources.tabs.onUpdated.addListener((tabId, changeInfo, raw) =>
    emitWhenPresent(fromChromeTab(raw), (tab) => ({
      _tag: "TabUpdated",
      tabId: TabId.make(tabId),
      changes: fromChromeTabChangeInfo(changeInfo),
      tab,
    })),
  )
  sources.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) =>
    emit({
      _tag: "TabRemoved",
      tabId: TabId.make(tabId),
      windowId: WindowId.make(windowId),
      isWindowClosing,
    }),
  )
  sources.tabs.onActivated.addListener(({ tabId, windowId }) =>
    emit({ _tag: "TabActivated", tabId: TabId.make(tabId), windowId: WindowId.make(windowId) }),
  )
  sources.tabs.onMoved.addListener((tabId, { windowId, fromIndex, toIndex }) =>
    emit({
      _tag: "TabMoved",
      tabId: TabId.make(tabId),
      windowId: WindowId.make(windowId),
      fromIndex,
      toIndex,
    }),
  )
  sources.tabs.onAttached.addListener((tabId, { newWindowId, newPosition }) =>
    emit({
      _tag: "TabAttached",
      tabId: TabId.make(tabId),
      newWindowId: WindowId.make(newWindowId),
      newPosition,
    }),
  )
  sources.tabs.onDetached.addListener((tabId, { oldWindowId, oldPosition }) =>
    emit({
      _tag: "TabDetached",
      tabId: TabId.make(tabId),
      oldWindowId: WindowId.make(oldWindowId),
      oldPosition,
    }),
  )
  sources.tabs.onReplaced.addListener((addedTabId, removedTabId) =>
    emit({
      _tag: "TabReplaced",
      addedTabId: TabId.make(addedTabId),
      removedTabId: TabId.make(removedTabId),
    }),
  )

  sources.tabGroups.onCreated.addListener((raw) =>
    emit({ _tag: "TabGroupCreated", group: fromChromeTabGroup(raw) }),
  )
  sources.tabGroups.onUpdated.addListener((raw) =>
    emit({ _tag: "TabGroupUpdated", group: fromChromeTabGroup(raw) }),
  )
  sources.tabGroups.onRemoved.addListener((raw) =>
    emit({ _tag: "TabGroupRemoved", group: fromChromeTabGroup(raw) }),
  )
  sources.tabGroups.onMoved.addListener((raw) =>
    emit({ _tag: "TabGroupMoved", group: fromChromeTabGroup(raw) }),
  )

  sources.windows.onCreated.addListener((raw) =>
    emitWhenPresent(fromChromeWindow(raw), (window) => ({ _tag: "WindowCreated", window })),
  )
  sources.windows.onRemoved.addListener((windowId) =>
    emit({ _tag: "WindowRemoved", windowId: WindowId.make(windowId) }),
  )
  sources.windows.onFocusChanged.addListener((windowId) =>
    emit({ _tag: "WindowFocusChanged", windowId: windowIdFrom(windowId) }),
  )

  sources.bookmarks.onCreated.addListener((_id, raw) =>
    emit({ _tag: "BookmarkCreated", node: fromChromeBookmark(raw) }),
  )
  sources.bookmarks.onChanged.addListener((id, { title, url }) =>
    emit({
      _tag: "BookmarkChanged",
      id: BookmarkId.make(id),
      title,
      url: Option.fromNullishOr(url),
    }),
  )
  sources.bookmarks.onMoved.addListener((id, { parentId, index, oldParentId, oldIndex }) =>
    emit({
      _tag: "BookmarkMoved",
      id: BookmarkId.make(id),
      parentId: BookmarkId.make(parentId),
      index,
      oldParentId: BookmarkId.make(oldParentId),
      oldIndex,
    }),
  )
  sources.bookmarks.onRemoved.addListener((id, { parentId, index, node }) =>
    emit({
      _tag: "BookmarkRemoved",
      id: BookmarkId.make(id),
      parentId: BookmarkId.make(parentId),
      index,
      node: fromChromeBookmark(node),
    }),
  )
  sources.bookmarks.onChildrenReordered.addListener((id, { childIds }) =>
    emit({
      _tag: "BookmarkChildrenReordered",
      id: BookmarkId.make(id),
      childIds: childIds.map((childId) => BookmarkId.make(childId)),
    }),
  )

  sources.alarms.onAlarm.addListener((raw) =>
    emit({ _tag: "AlarmFired", alarm: fromChromeAlarm(raw) }),
  )
  sources.commands.onCommand.addListener((command, raw) =>
    emit({
      _tag: "CommandTriggered",
      command,
      tab: Option.flatMap(Option.fromNullishOr(raw), fromChromeTab),
    }),
  )

  sources.runtime.onInstalled.addListener(({ reason, previousVersion }) =>
    emit({
      _tag: "RuntimeInstalled",
      reason,
      previousVersion: Option.fromNullishOr(previousVersion),
    }),
  )
  sources.runtime.onStartup.addListener(() => emit({ _tag: "RuntimeStartup" }))
  sources.runtime.onConnect.addListener((port) =>
    connections.push(
      fromChromePort(port, Option.some(fromChromeMessageSender(port.sender, false))),
    ),
  )
  sources.runtime.onConnectExternal.addListener((port) =>
    connections.push(fromChromePort(port, Option.some(fromChromeMessageSender(port.sender, true)))),
  )

  return { events: events.stream, connections: connections.stream }
}

export class BrowserEvents extends Context.Service<BrowserEvents, CapturedBrowserEvents>()(
  "katip/platform/browser/BrowserEvents",
) {
  static readonly layer = (captured: CapturedBrowserEvents): Layer.Layer<BrowserEvents> =>
    Layer.succeed(BrowserEvents, captured)
}
