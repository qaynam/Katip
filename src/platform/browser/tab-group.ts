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

/** Chrome gives an untitled group an empty string or undefined; both become `title: None`. */
export const fromChromeTabGroup = (raw: chrome.tabGroups.TabGroup): BrowserTabGroup => ({
  id: TabGroupId.make(raw.id),
  windowId: WindowId.make(raw.windowId),
  title: nonEmptyString(raw.title),
  color: raw.color,
  collapsed: raw.collapsed,
})
