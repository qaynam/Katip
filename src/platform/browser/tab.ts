import { Option, Schema } from "effect"
import { nonEmptyString, tabGroupIdFrom, tabIdFrom } from "./chrome-values"
import { TabGroupId, TabId, WindowId } from "./ids"

export const TabStatus = Schema.Literals(["unloaded", "loading", "complete"])
export type TabStatus = typeof TabStatus.Type

export const BrowserTab = Schema.Struct({
  id: TabId,
  windowId: WindowId,
  index: Schema.Int,
  url: Schema.OptionFromNullOr(Schema.String),
  pendingUrl: Schema.OptionFromNullOr(Schema.String),
  title: Schema.OptionFromNullOr(Schema.String),
  favIconUrl: Schema.OptionFromNullOr(Schema.String),
  status: Schema.OptionFromNullOr(TabStatus),
  active: Schema.Boolean,
  pinned: Schema.Boolean,
  audible: Schema.Boolean,
  muted: Schema.Boolean,
  discarded: Schema.Boolean,
  incognito: Schema.Boolean,
  openerTabId: Schema.OptionFromNullOr(TabId),
  groupId: Schema.OptionFromNullOr(TabGroupId),
  lastAccessed: Schema.OptionFromNullOr(Schema.Number),
})
export type BrowserTab = typeof BrowserTab.Type

/**
 * Chrome のタブを {@link BrowserTab} に変換する。
 *
 * @returns ID を持たないタブ（devtools や他端末のセッションなど）は `None`。
 */
export const fromChromeTab = (raw: chrome.tabs.Tab): Option.Option<BrowserTab> =>
  Option.map(tabIdFrom(raw.id), (id) => ({
    id,
    windowId: WindowId.make(raw.windowId),
    index: raw.index,
    url: nonEmptyString(raw.url),
    pendingUrl: nonEmptyString(raw.pendingUrl),
    title: nonEmptyString(raw.title),
    favIconUrl: nonEmptyString(raw.favIconUrl),
    status: Option.fromNullishOr(raw.status),
    active: raw.active,
    pinned: raw.pinned,
    audible: raw.audible ?? false,
    muted: raw.mutedInfo?.muted ?? false,
    discarded: raw.discarded,
    incognito: raw.incognito,
    openerTabId: tabIdFrom(raw.openerTabId),
    groupId: tabGroupIdFrom(raw.groupId),
    // 型定義上は必須だが Chrome 121 で追加された値で、minimum_chrome_version の 120 では返らない
    lastAccessed: Option.fromNullishOr(raw.lastAccessed),
  }))

/** `tabs.onUpdated` で変化したと通知された項目だけを持つ。 */
export const TabChanges = Schema.Struct({
  url: Schema.optionalKey(Schema.String),
  title: Schema.optionalKey(Schema.String),
  favIconUrl: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(TabStatus),
  pinned: Schema.optionalKey(Schema.Boolean),
  audible: Schema.optionalKey(Schema.Boolean),
  muted: Schema.optionalKey(Schema.Boolean),
  discarded: Schema.optionalKey(Schema.Boolean),
  groupId: Schema.optionalKey(Schema.OptionFromNullOr(TabGroupId)),
})
export type TabChanges = typeof TabChanges.Type

export const fromChromeTabChangeInfo = (raw: chrome.tabs.OnUpdatedInfo): TabChanges => ({
  ...(raw.url !== undefined && { url: raw.url }),
  ...(raw.title !== undefined && { title: raw.title }),
  ...(raw.favIconUrl !== undefined && { favIconUrl: raw.favIconUrl }),
  ...(raw.status !== undefined && { status: raw.status }),
  ...(raw.pinned !== undefined && { pinned: raw.pinned }),
  ...(raw.audible !== undefined && { audible: raw.audible }),
  ...(raw.mutedInfo !== undefined && { muted: raw.mutedInfo.muted }),
  ...(raw.discarded !== undefined && { discarded: raw.discarded }),
  ...(raw.groupId !== undefined && { groupId: tabGroupIdFrom(raw.groupId) }),
})
