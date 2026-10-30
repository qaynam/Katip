import { Array, Match, Option } from "effect"
import type { LiveSource } from "#modules/live-folders"
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

/** 取得元から中身を取り込むフォルダ。中身はブックマークに持たないので、ノードとしては子を持たない。 */
export interface PinnedLiveFolder {
  readonly _tag: "PinnedLiveFolder"
  readonly id: BookmarkId
  readonly title: string
  readonly source: LiveSource
}

export type PinnedNode = PinnedBookmark | PinnedSplit | PinnedLiveFolder | PinnedFolder

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

// 印の付いたフォルダでも、外部でブックマークを入れられたものはライブフォルダとして扱わない。
// 普通のフォルダとして見せ、入れられたブックマークを隠さない
const pinnedLiveFolderFrom = (
  folder: BookmarkFolder,
  source: LiveSource,
): Option.Option<PinnedLiveFolder> =>
  Option.flatMap(folder.children, (children) =>
    children.length === 0
      ? Option.some({ _tag: "PinnedLiveFolder", id: folder.id, title: folder.title, source })
      : Option.none(),
  )

/** フォルダに付けた印。どちらも無いフォルダは普通のフォルダとして読む。 */
export interface FolderMarks {
  /** 分割ビューとしてピン留めしたフォルダの ID。 */
  readonly splitFolders?: ReadonlySet<BookmarkId>
  /** ライブフォルダとして作ったフォルダの ID と、その取得元。 */
  readonly liveFolders?: ReadonlyMap<BookmarkId, LiveSource>
}

const markedNodeFrom = (folder: BookmarkFolder, marks: FolderMarks): Option.Option<PinnedNode> => {
  if (marks.splitFolders?.has(folder.id)) return pinnedSplitFrom(folder)
  return Option.match(Option.fromNullishOr(marks.liveFolders?.get(folder.id)), {
    onNone: () => Option.none(),
    onSome: (source) => pinnedLiveFolderFrom(folder, source),
  })
}

const pinnedNodeFrom =
  (marks: FolderMarks) =>
  (node: BookmarkNode): Option.Option<PinnedNode> =>
    Match.valueTags(node, {
      Bookmark: () => pinnedBookmarkFrom(node),
      BookmarkFolder: (folder) =>
        Option.orElse(markedNodeFrom(folder, marks), () =>
          Option.map(pinnedTreeFrom(folder, marks), (children): PinnedNode => ({
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
 */
export const pinnedTreeFrom = (
  spaceFolder: BookmarkFolder,
  marks: FolderMarks = {},
): Option.Option<PinnedTree> =>
  Option.flatMap(spaceFolder.children, (children) =>
    Option.all(children.map(pinnedNodeFrom(marks))),
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
      PinnedLiveFolder: () => Option.none(),
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
      PinnedLiveFolder: () => [],
      PinnedFolder: splitIdsWithin,
    }),
  )

/** ツリーのすべての階層にあるライブフォルダを、ツリーの上から順に返す。 */
export const liveFoldersIn = (tree: PinnedTree): ReadonlyArray<PinnedLiveFolder> =>
  tree.flatMap((node) =>
    Match.valueTags(node, {
      PinnedBookmark: (): ReadonlyArray<PinnedLiveFolder> => [],
      PinnedSplit: () => [],
      PinnedLiveFolder: (live) => [live],
      PinnedFolder: (folder) => liveFoldersIn(folder.children),
    }),
  )

/**
 * フォルダ自身を 1 段目として数えた、配下のフォルダの段数。
 *
 * 分割ピンとライブフォルダは 1 つのピンとして扱い、段に数えない。
 */
export const folderHeight = (folder: PinnedFolder): number =>
  1 +
  Math.max(
    0,
    ...folder.children.map((child) => (child._tag === "PinnedFolder" ? folderHeight(child) : 0)),
  )
