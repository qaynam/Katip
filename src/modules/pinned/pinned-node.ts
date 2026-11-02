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

/** Two bookmarks pinned as a split view, left then right. */
export interface PinnedSplit {
  readonly _tag: "PinnedSplit"
  /** The ID of the folder holding the two bookmarks. */
  readonly id: BookmarkId
  readonly title: string
  readonly items: readonly [PinnedBookmark, PinnedBookmark]
}

/**
 * A folder whose contents are fetched from a source. The contents aren't kept as bookmarks, so
 * the node has no children.
 */
export interface PinnedLiveFolder {
  readonly _tag: "PinnedLiveFolder"
  readonly id: BookmarkId
  readonly title: string
  readonly source: LiveSource
}

export type PinnedNode = PinnedBookmark | PinnedSplit | PinnedLiveFolder | PinnedFolder

/** The nodes directly inside a Space folder, in the bookmarks' own order. */
export type PinnedTree = ReadonlyArray<PinnedNode>

export interface PinnedNodeLocation {
  readonly node: PinnedNode
  /** None means directly inside the Space. */
  readonly parentFolderId: Option.Option<BookmarkId>
  /** 1 directly inside the Space. */
  readonly depth: number
  /** The position among the parent's children. */
  readonly index: number
}

const pinnedBookmarkFrom = (node: BookmarkNode): Option.Option<PinnedBookmark> =>
  node._tag === "Bookmark"
    ? Option.some({ _tag: "PinnedBookmark", id: node.id, title: node.title, url: node.url })
    : Option.none()

// A marked folder whose contents were changed outside Katip so they are no longer two bookmarks
// can't be a split. It shows as an ordinary folder so the pins inside aren't lost
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

// A marked folder that had bookmarks put in it outside Katip isn't a live folder. It shows as an
// ordinary folder so those bookmarks aren't hidden
const pinnedLiveFolderFrom = (
  folder: BookmarkFolder,
  source: LiveSource,
): Option.Option<PinnedLiveFolder> =>
  Option.flatMap(folder.children, (children) =>
    children.length === 0
      ? Option.some({ _tag: "PinnedLiveFolder", id: folder.id, title: folder.title, source })
      : Option.none(),
  )

/** The marks put on folders. A folder with neither mark is read as an ordinary folder. */
export interface FolderMarks {
  /** The IDs of folders pinned as a split view. */
  readonly splitFolders?: ReadonlySet<BookmarkId>
  /** The IDs of folders created as live folders, each with the source it fetches from. */
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
 * Converts a Space folder's subtree into the pinned tree directly inside the Space.
 *
 * Returns None if any folder in it has its children unloaded, since such a folder can't be told
 * apart from an empty one.
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

/** Returns the IDs of the folder itself and of every folder at any depth inside it, depth first. */
export const folderIdsWithin = (folder: PinnedFolder): ReadonlyArray<BookmarkId> => [
  folder.id,
  ...folder.children.flatMap((child) =>
    child._tag === "PinnedFolder" ? folderIdsWithin(child) : [],
  ),
]

/** The IDs of the folders pinned as a split view anywhere inside the folder. */
export const splitIdsWithin = (folder: PinnedFolder): ReadonlyArray<BookmarkId> =>
  folder.children.flatMap((child) =>
    Match.valueTags(child, {
      PinnedBookmark: (): ReadonlyArray<BookmarkId> => [],
      PinnedSplit: (split) => [split.id],
      PinnedLiveFolder: () => [],
      PinnedFolder: splitIdsWithin,
    }),
  )

/** Returns the live folders at every level of the tree, from the top of the tree down. */
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
 * How many levels of folders the folder spans, counting itself as the first.
 *
 * Split pins and live folders count as single pins, not as levels.
 */
export const folderHeight = (folder: PinnedFolder): number =>
  1 +
  Math.max(
    0,
    ...folder.children.map((child) => (child._tag === "PinnedFolder" ? folderHeight(child) : 0)),
  )
