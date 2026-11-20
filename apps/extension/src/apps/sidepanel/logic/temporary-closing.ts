import type { TabId } from "#platform/browser"
import type { TemporaryEntry } from "#protocol"

const tabsOf = (entry: TemporaryEntry): ReadonlyArray<TabId> =>
  entry._tag === "TemporaryTab" ? [entry.tab.tabId] : entry.tabs.map((tab) => tab.tabId)

const indexHolding = (entries: ReadonlyArray<TemporaryEntry>, tabId: TabId) =>
  entries.findIndex((entry) => tabsOf(entry).includes(tabId))

/**
 * The temporary tabs to close for Close Other Tabs on `tabId`: every one but those of its row, so
 * a split view keeps both its tabs. None when the tab isn't among them.
 */
export const otherTemporaryTabs = (
  entries: ReadonlyArray<TemporaryEntry>,
  tabId: TabId,
): ReadonlyArray<TabId> => {
  const held = indexHolding(entries, tabId)
  return held === -1 ? [] : entries.filter((_, index) => index !== held).flatMap(tabsOf)
}

/**
 * The temporary tabs to close for Close Tabs Below on `tabId`: those of the rows shown under its
 * row. None when the tab isn't among them.
 */
export const temporaryTabsBelow = (
  entries: ReadonlyArray<TemporaryEntry>,
  tabId: TabId,
): ReadonlyArray<TabId> => {
  const held = indexHolding(entries, tabId)
  return held === -1 ? [] : entries.slice(held + 1).flatMap(tabsOf)
}
