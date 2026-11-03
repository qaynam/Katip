import { peekableItems } from "#modules/sidebar-view"
import type { PinnedNodeView, SidebarView } from "#protocol"

// The fixture looks as it does with "Show all open tabs in collapsed folders" turned on
const SHOW_ALL_OPEN_TABS_IN_COLLAPSED_FOLDERS = true

const withPeeksIn = (nodes: ReadonlyArray<PinnedNodeView>): ReadonlyArray<PinnedNodeView> =>
  nodes.map((node) => {
    if (node._tag !== "PinnedFolder") return node
    const children = withPeeksIn(node.children)
    return {
      ...node,
      children,
      peekedItems: node.isExpanded
        ? []
        : peekableItems(children, SHOW_ALL_OPEN_TABS_IN_COLLAPSED_FOLDERS),
    }
  })

/**
 * Recomputes what collapsed folders show, by the background's rules. Call it on every change to
 * the view: kept by hand, it would drift from the folders' contents with every expand, collapse,
 * move, or opened tab.
 */
export const withRecomputedPeeks = (view: SidebarView): SidebarView => ({
  ...view,
  spaces: view.spaces.map((space) =>
    space.pinned._tag === "Available"
      ? { ...space, pinned: { ...space.pinned, nodes: withPeeksIn(space.pinned.nodes) } }
      : space,
  ),
})
