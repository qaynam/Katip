import { peekableItems } from "#modules/sidebar-view"
import type { PinnedNodeView, SidebarView } from "#protocol"

// フィクスチャは「閉じたフォルダでも開いているタブをすべて表示」をオンにした見た目にする
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
 * 閉じたフォルダに覗かせるものを、background と同じ規則で作り直す。
 * 手で持つと、開閉・移動・タブを開くたびに中身と食い違うため、ビューを変えるたびに呼ぶ。
 */
export const withRecomputedPeeks = (view: SidebarView): SidebarView => ({
  ...view,
  spaces: view.spaces.map((space) =>
    space.pinned._tag === "Available"
      ? { ...space, pinned: { ...space.pinned, nodes: withPeeksIn(space.pinned.nodes) } }
      : space,
  ),
})
