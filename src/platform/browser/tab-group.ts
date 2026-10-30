import { Schema } from "effect"
import { nonEmptyString } from "./chrome-values"
import { TabGroupId, WindowId } from "./ids"

export const TabGroupColor = Schema.Literals([
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
])
export type TabGroupColor = typeof TabGroupColor.Type

export const BrowserTabGroup = Schema.Struct({
  id: TabGroupId,
  windowId: WindowId,
  title: Schema.OptionFromNullOr(Schema.String),
  color: TabGroupColor,
  collapsed: Schema.Boolean,
})
export type BrowserTabGroup = typeof BrowserTabGroup.Type

/** 無題のグループは Chrome では空文字か undefined になるが、どちらも `title: None` にそろえる。 */
export const fromChromeTabGroup = (raw: chrome.tabGroups.TabGroup): BrowserTabGroup => ({
  id: TabGroupId.make(raw.id),
  windowId: WindowId.make(raw.windowId),
  title: nonEmptyString(raw.title),
  color: raw.color,
  collapsed: raw.collapsed,
})
