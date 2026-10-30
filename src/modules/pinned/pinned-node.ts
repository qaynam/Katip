import { Array, Match, Option } from "effect"
import type { BookmarkFolder, BookmarkId, BookmarkNode } from "#platform/browser"
import { SPACE_ROOT_DEPTH } from "./folder-depth"

export interface PinnedBookmark {
  readonly _tag: "PinnedBookmark"
  readonly id: BookmarkId
  readonly title: string
  readonly url: string
}

export interface PinnedFolder {
  readonly _tag: "PinnedFolder"
  readonly id: BookmarkId
  readonly title: string
  readonly children: PinnedTree
}

export type PinnedNode = PinnedBookmark | PinnedFolder

/** Space フォルダの直下に並ぶノード。順序はブックマークの並び順そのもの。 */
export type PinnedTree = ReadonlyArray<PinnedNode>

export interface PinnedNodeLocation {
  readonly node: PinnedNode
  /** None は Space 直下を表す。 */
  readonly parentFolderId: Option.Option<BookmarkId>
  /** Space 直下が 1。 */
  readonly depth: number
  /** 親の子の中での位置。 */
  readonly index: number
}

const pinnedNodeFrom = (node: BookmarkNode): Option.Option<PinnedNode> =>
  Match.valueTags(node, {
    Bookmark: ({ id, title, url }) =>
      Option.some<PinnedNode>({ _tag: "PinnedBookmark", id, title, url }),
    BookmarkFolder: (folder) =>
      Option.map(pinnedTreeFrom(folder), (children): PinnedNode => ({
        _tag: "PinnedFolder",
        id: folder.id,
        title: folder.title,
        children,
      })),
  })

/**
 * Space フォルダのサブツリーを、Space 直下のピン留めツリーに変換する。
 *
 * 子を読み込んでいないフォルダが 1 つでも含まれていれば None を返す（空のフォルダと区別できないため）。
 */
export const pinnedTreeFrom = (spaceFolder: BookmarkFolder): Option.Option<PinnedTree> =>
  Option.flatMap(spaceFolder.children, (children) => Option.all(children.map(pinnedNodeFrom)))

const findWithin = (
  nodes: PinnedTree,
  id: BookmarkId,
  parentFolderId: Option.Option<BookmarkId>,
  depth: number,
): Option.Option<PinnedNodeLocation> =>
  Array.findFirst(nodes, (node, index) => {
    if (node.id === id) {
      return Option.some({ node, parentFolderId, depth, index })
    }
    return node._tag === "PinnedFolder"
      ? findWithin(node.children, id, Option.some(node.id), depth + 1)
      : Option.none()
  })

export const findPinnedNode = (
  tree: PinnedTree,
  id: BookmarkId,
): Option.Option<PinnedNodeLocation> => findWithin(tree, id, Option.none(), SPACE_ROOT_DEPTH + 1)

/** フォルダ自身と、配下のすべての階層のフォルダの ID を深さ優先の順で返す。 */
export const folderIdsWithin = (folder: PinnedFolder): ReadonlyArray<BookmarkId> => [
  folder.id,
  ...folder.children.flatMap((child) =>
    child._tag === "PinnedFolder" ? folderIdsWithin(child) : [],
  ),
]
