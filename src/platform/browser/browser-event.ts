import { Schema } from "effect"
import { BrowserAlarm } from "./alarm"
import { BookmarkNode } from "./bookmark"
import { BookmarkId, TabId, WindowId } from "./ids"
import { BrowserTab, TabChanges } from "./tab"
import { BrowserTabGroup } from "./tab-group"
import { BrowserWindow } from "./window"

export const InstallReason = Schema.Literals([
  "install",
  "update",
  "chrome_update",
  "shared_module_update",
])
export type InstallReason = typeof InstallReason.Type

/** Chrome の各 API のイベントを 1 対 1 に写したもの。タグ名は `<API><イベント名>` にそろえる。 */
export const BrowserEvent = Schema.TaggedUnion({
  TabCreated: { tab: BrowserTab },
  TabUpdated: { tabId: TabId, changes: TabChanges, tab: BrowserTab },
  TabRemoved: { tabId: TabId, windowId: WindowId, isWindowClosing: Schema.Boolean },
  TabActivated: { tabId: TabId, windowId: WindowId },
  TabMoved: { tabId: TabId, windowId: WindowId, fromIndex: Schema.Int, toIndex: Schema.Int },
  TabAttached: { tabId: TabId, newWindowId: WindowId, newPosition: Schema.Int },
  TabDetached: { tabId: TabId, oldWindowId: WindowId, oldPosition: Schema.Int },
  TabReplaced: { addedTabId: TabId, removedTabId: TabId },
  TabGroupCreated: { group: BrowserTabGroup },
  TabGroupUpdated: { group: BrowserTabGroup },
  TabGroupRemoved: { group: BrowserTabGroup },
  TabGroupMoved: { group: BrowserTabGroup },
  WindowCreated: { window: BrowserWindow },
  WindowRemoved: { windowId: WindowId },
  // None はどの Chrome ウィンドウにもフォーカスが無い状態（別アプリへ切り替えたなど）
  WindowFocusChanged: { windowId: Schema.OptionFromNullOr(WindowId) },
  BookmarkCreated: { node: BookmarkNode },
  BookmarkChanged: {
    id: BookmarkId,
    title: Schema.String,
    url: Schema.OptionFromNullOr(Schema.String),
  },
  BookmarkMoved: {
    id: BookmarkId,
    parentId: BookmarkId,
    index: Schema.Int,
    oldParentId: BookmarkId,
    oldIndex: Schema.Int,
  },
  BookmarkRemoved: { id: BookmarkId, parentId: BookmarkId, index: Schema.Int, node: BookmarkNode },
  BookmarkChildrenReordered: { id: BookmarkId, childIds: Schema.Array(BookmarkId) },
  AlarmFired: { alarm: BrowserAlarm },
  CommandTriggered: { command: Schema.String, tab: Schema.OptionFromNullOr(BrowserTab) },
  RuntimeInstalled: {
    reason: InstallReason,
    previousVersion: Schema.OptionFromNullOr(Schema.String),
  },
  RuntimeStartup: {},
})
export type BrowserEvent = typeof BrowserEvent.Type
