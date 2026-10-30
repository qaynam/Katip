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

/** 分割ビューとしてピン留めした 2 つのブックマーク。並びは左、右の順。 */
export interface PinnedSplit {
  readonly _tag: "PinnedSplit"
  /** 2 つのブックマークを入れたフォルダの ID。 */
  readonly id: BookmarkId
  readonly title: string
  readonly items: readonly [PinnedBookmark, PinnedBookmark]
}

export type PinnedNode = PinnedBookmark | PinnedSplit | PinnedFolder

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

const pinnedBookmarkFrom = (node: BookmarkNode): Option.Option<PinnedBookmark> =>
  node._tag === "Bookmark"
    ? Option.some({ _tag: "PinnedBookmark", id: node.id, title: node.title, url: node.url })
    : Option.none()

// 印の付いたフォルダでも、外部で中身が 2 つのブックマークでなくなったものは分割として扱えない。
// 普通のフォルダとして見せ、中のピンを失わせない
const pinnedSplitFrom = (folder: BookmarkFolder): Option.Option<PinnedSplit> =>
  Option.flatMap(folder.children, (children) => {
    const [left, right] = Array.getSomes(children.map(pinnedBookmarkFrom))
    return children.length === 2 && left !== undefined && right !== undefined
      ? Option.some({
          _tag: "PinnedSplit",
          id: folder.id,
          title: folder.title,
          items: [left, right],
        })
      : Option.none()
  })

const pinnedNodeFrom =
  (splitFolders: ReadonlySet<BookmarkId>) =>
  (node: BookmarkNode): Option.Option<PinnedNode> =>
    Match.valueTags(node, {
      Bookmark: () => pinnedBookmarkFrom(node),
      BookmarkFolder: (folder) =>
        Option.orElse(
          splitFolders.has(folder.id) ? pinnedSplitFrom(folder) : Option.none<PinnedNode>(),
          () =>
            Option.map(pinnedTreeFrom(folder, splitFolders), (children): PinnedNode => ({
              _tag: "PinnedFolder",
              id: folder.id,
              title: folder.title,
              children,
            })),
        ),
    })

/**
 * Space フォルダのサブツリーを、Space 直下のピン留めツリーに変換する。
 *
 * 子を読み込んでいないフォルダが 1 つでも含まれていれば None を返す（空のフォルダと区別できないため）。
 *
 * @param splitFolders - 分割ビューとしてピン留めしたフォルダの ID。
 */
export const pinnedTreeFrom = (
  spaceFolder: BookmarkFolder,
  splitFolders: ReadonlySet<BookmarkId> = new Set(),
): Option.Option<PinnedTree> =>
  Option.flatMap(spaceFolder.children, (children) =>
    Option.all(children.map(pinnedNodeFrom(splitFolders))),
  )

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
    return Match.valueTags(node, {
      PinnedBookmark: () => Option.none(),
      PinnedSplit: (split) => findWithin(split.items, id, Option.some(split.id), depth + 1),
      PinnedFolder: (folder) => findWithin(folder.children, id, Option.some(folder.id), depth + 1),
    })
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

/** フォルダの配下にある、分割ビューとしてピン留めしたフォルダの ID。 */
export const splitIdsWithin = (folder: PinnedFolder): ReadonlyArray<BookmarkId> =>
  folder.children.flatMap((child) =>
    Match.valueTags(child, {
      PinnedBookmark: (): ReadonlyArray<BookmarkId> => [],
      PinnedSplit: (split) => [split.id],
      PinnedFolder: splitIdsWithin,
    }),
  )
