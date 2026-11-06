import type { TabId } from "#platform/browser"
import type {
  FavoriteView,
  PinnedItemView,
  PinnedNodeView,
  PinnedSplitView,
  SidebarView,
  SpaceView,
  TabView,
  TemporaryEntry,
} from "#protocol"

/** The view with `tabId` as the window's only active tab, wherever that tab shows. */
export const withActiveTab = (view: SidebarView, tabId: TabId): SidebarView => {
  const tab = (shown: TabView): TabView => ({ ...shown, isActive: shown.tabId === tabId })
  const item = (pin: PinnedItemView): PinnedItemView =>
    pin.openTab === null ? pin : { ...pin, openTab: { ...pin.openTab, tab: tab(pin.openTab.tab) } }
  const split = (pin: PinnedSplitView): PinnedSplitView => ({
    ...pin,
    items: [item(pin.items[0]), item(pin.items[1])],
  })
  const node = (pinned: PinnedNodeView): PinnedNodeView => {
    switch (pinned._tag) {
      case "PinnedItem":
        return item(pinned)
      case "PinnedSplit":
        return split(pinned)
      case "PinnedFolder":
        return {
          ...pinned,
          children: pinned.children.map(node),
          peekedItems: pinned.peekedItems.map((peeked) =>
            peeked._tag === "PinnedItem" ? item(peeked) : split(peeked),
          ),
        }
      case "PinnedLiveFolder":
        return pinned
    }
  }
  const entry = (temporary: TemporaryEntry): TemporaryEntry =>
    temporary._tag === "TemporaryTab"
      ? { ...temporary, tab: tab(temporary.tab) }
      : { ...temporary, tabs: [tab(temporary.tabs[0]), tab(temporary.tabs[1])] }
  const space = (shown: SpaceView): SpaceView => ({
    ...shown,
    pinned:
      shown.pinned._tag === "Available"
        ? { ...shown.pinned, nodes: shown.pinned.nodes.map(node) }
        : shown.pinned,
    temporaryEntries: shown.temporaryEntries.map(entry),
  })
  const favorite = (shown: FavoriteView): FavoriteView =>
    shown.openTab === null
      ? shown
      : { ...shown, openTab: { ...shown.openTab, isActive: shown.openTab.tabId === tabId } }
  return { ...view, spaces: view.spaces.map(space), favorites: view.favorites.map(favorite) }
}

/** Every tab the view shows as active. The same tab is listed again for each place it shows. */
export const activeTabIdsIn = (view: SidebarView): ReadonlyArray<TabId> => {
  const found: Array<TabId> = []
  const tab = (shown: TabView) => {
    if (shown.isActive) found.push(shown.tabId)
  }
  const item = (pin: PinnedItemView) => {
    if (pin.openTab !== null) tab(pin.openTab.tab)
  }
  const node = (pinned: PinnedNodeView): void => {
    switch (pinned._tag) {
      case "PinnedItem":
        return item(pinned)
      case "PinnedSplit":
        return pinned.items.forEach(item)
      case "PinnedFolder":
        pinned.children.forEach(node)
        return pinned.peekedItems.forEach(node)
      case "PinnedLiveFolder":
        return
    }
  }
  for (const space of view.spaces) {
    if (space.pinned._tag === "Available") space.pinned.nodes.forEach(node)
    for (const temporary of space.temporaryEntries) {
      if (temporary._tag === "TemporaryTab") tab(temporary.tab)
      else temporary.tabs.forEach(tab)
    }
  }
  for (const favorite of view.favorites) {
    if (favorite.openTab?.isActive === true) found.push(favorite.openTab.tabId)
  }
  return found
}
