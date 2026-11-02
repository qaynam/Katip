import { Array, Context, Data, Effect, Layer, Option } from "effect"
import type { LiveSource } from "#modules/live-folders"
import type { SpaceId } from "#modules/space"
import { Bookmarks, type BookmarkId, type BrowserApiError } from "#platform/browser"
import {
  canCreateFolderInside,
  maxFolderDepth,
  SPACE_ROOT_DEPTH,
  type FolderNestingRule,
} from "./folder-depth"
import { FolderExpansionStore } from "./folder-expansion-store"
import { FolderIconStore } from "./folder-icon-store"
import { LiveFolderStore } from "./live-folder-store"
import {
  FolderDepthExceeded,
  MoveIntoDescendant,
  PinnedNodeNotFound,
  PinnedTreeUnavailable,
} from "./pinned-errors"
import {
  findPinnedNode,
  folderHeight,
  folderIdsWithin,
  liveFoldersIn,
  pinnedTreeFrom,
  splitIdsWithin,
  type PinnedFolder,
  type PinnedNodeLocation,
  type PinnedTree,
} from "./pinned-node"
import { SplitFolderStore } from "./split-folder-store"
import { SpaceFolders, type SpaceFolderOwner } from "./space-folders"

export type PinnedParent = Data.TaggedEnum<{
  /**
   * Directly inside the Space folder. Carries the Space's name too, to recreate a missing folder.
   */
  SpaceRoot: { readonly space: SpaceFolderOwner }
  Folder: { readonly folderId: BookmarkId }
}>
export const PinnedParent = Data.taggedEnum<PinnedParent>()

export interface PinnedPosition {
  readonly parent: PinnedParent
  /** The position among the parent's children once created or moved. The end when omitted. */
  readonly index?: number
}

export interface PinnedLocation extends PinnedNodeLocation {
  readonly spaceId: SpaceId
}

export interface PinnedBookmarkDraft {
  readonly title: string
  readonly url: string
}

export interface PinnedSplitDraft {
  readonly title: string
  readonly left: PinnedBookmarkDraft
  readonly right: PinnedBookmarkDraft
}

export interface PinnedLiveFolderDraft {
  readonly title: string
  readonly source: LiveSource
}

export interface CreatedSplit {
  readonly folderId: BookmarkId
  readonly left: BookmarkId
  readonly right: BookmarkId
}

const atIndex = (index: number | undefined) => (index === undefined ? {} : { index })

const isSameParent = (location: PinnedLocation, parent: PinnedParent): boolean =>
  PinnedParent.$match(parent, {
    SpaceRoot: ({ space }) =>
      location.spaceId === space.id && Option.isNone(location.parentFolderId),
    Folder: ({ folderId }) => Option.contains(location.parentFolderId, folderId),
  })

// Chrome's move counts the index in the order before the move, the moving node included, so a
// move later within the same parent has to point one further or it lands one short of the target
const chromeMoveIndex = (from: PinnedLocation, to: PinnedPosition): number | undefined =>
  to.index !== undefined && isSameParent(from, to.parent) && from.index < to.index
    ? to.index + 1
    : to.index

export class PinnedBookmarks extends Context.Service<
  PinnedBookmarks,
  {
    /**
     * Never returns a partly read tree: fails with {@link PinnedTreeUnavailable} unless all of it
     * can be read.
     */
    loadSpaceTree(spaceId: SpaceId): Effect.Effect<PinnedTree, PinnedTreeUnavailable>
    /** Returns only the Space trees that could be read. A Space left out couldn't be read. */
    readonly loadAllSpaceTrees: Effect.Effect<ReadonlyMap<SpaceId, PinnedTree>>
    /**
     * Returns which Space the node is in and where.
     *
     * A node that isn't under Katip's Space folders isn't found, even if a bookmark with that ID
     * exists outside Katip.
     */
    locate(
      bookmarkId: BookmarkId,
    ): Effect.Effect<PinnedLocation, PinnedNodeNotFound | BrowserApiError>
    createBookmark(
      position: PinnedPosition,
      draft: PinnedBookmarkDraft,
    ): Effect.Effect<BookmarkId, PinnedNodeNotFound | BrowserApiError>
    /**
     * Pins a split view: creates a folder holding the two bookmarks and marks it as a split.
     *
     * Not bound by the folder depth limit, since it counts as a single pin rather than a folder
     * whose contents the user organizes.
     */
    createSplit(
      position: PinnedPosition,
      draft: PinnedSplitDraft,
    ): Effect.Effect<CreatedSplit, PinnedNodeNotFound | BrowserApiError>
    /**
     * Creates a live folder: an empty folder marked as a live folder with its source, saved as
     * expanded.
     *
     * Not bound by the folder depth limit, since it counts as a single pin rather than a folder
     * whose contents the user organizes.
     */
    createLiveFolder(
      position: PinnedPosition,
      draft: PinnedLiveFolderDraft,
    ): Effect.Effect<BookmarkId, PinnedNodeNotFound | BrowserApiError>
    /** The created folder is saved as expanded. */
    createFolder(
      position: PinnedPosition,
      draft: { readonly title: string },
      rule: FolderNestingRule,
    ): Effect.Effect<BookmarkId, PinnedNodeNotFound | FolderDepthExceeded | BrowserApiError>
    /**
     * Moves a pinned node (a bookmark, split pin, live folder or folder), to another Space too.
     *
     * A folder is refused with {@link FolderDepthExceeded} when, after the move, the deepest folder
     * in it would be past the depth limit of `rule` and deeper than it is now. A folder already
     * deeper than the limit can still move to the same depth or shallower. A move into the folder
     * itself or a folder inside it is refused with {@link MoveIntoDescendant}.
     */
    moveNode(
      bookmarkId: BookmarkId,
      position: PinnedPosition,
      rule: FolderNestingRule,
    ): Effect.Effect<
      void,
      PinnedNodeNotFound | FolderDepthExceeded | MoveIntoDescendant | BrowserApiError
    >
    /**
     * Works for bookmarks and folders alike. Space folders are renamed through
     * {@link SpaceFolders}.
     */
    rename(
      bookmarkId: BookmarkId,
      title: string,
    ): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
    updateBookmark(
      bookmarkId: BookmarkId,
      draft: PinnedBookmarkDraft,
    ): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
    /**
     * Removes a bookmark, split pin or live folder. A split pin goes together with its two
     * bookmarks. A live folder's mark and expansion state are dropped too; the cache of its fetched
     * contents is the caller's to drop.
     */
    removeBookmark(
      bookmarkId: BookmarkId,
    ): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
    /**
     * Removes the folder with everything in it, dropping the expansion state and icons of its
     * folders and the marks of the split pins and live folders inside it.
     */
    removeFolder(folderId: BookmarkId): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
  }
>()("katip/pinned/PinnedBookmarks") {
  static readonly layerNoDeps = Layer.effect(
    PinnedBookmarks,
    Effect.gen(function* () {
      const bookmarks = yield* Bookmarks
      const spaceFolders = yield* SpaceFolders
      const folderExpansion = yield* FolderExpansionStore
      const folderIcons = yield* FolderIconStore
      const splitFolders = yield* SplitFolderStore
      const liveFolders = yield* LiveFolderStore

      const loadMarks = Effect.all({
        splitFolders: splitFolders.load,
        liveFolders: liveFolders.load,
      })

      const readableSpaceTrees = Effect.gen(function* () {
        const subtrees = yield* spaceFolders.readSpaceSubtrees
        const marks = yield* loadMarks
        return Array.getSomes(
          Array.fromIterable(subtrees).map(([spaceId, folder]) =>
            Option.map(pinnedTreeFrom(folder, marks), (tree) => ({ spaceId, tree })),
          ),
        )
      })

      const locate = Effect.fnUntraced(function* (bookmarkId: BookmarkId) {
        const spaceTrees = yield* readableSpaceTrees
        const found = Array.findFirst(spaceTrees, ({ spaceId, tree }) =>
          Option.map(findPinnedNode(tree, bookmarkId), (location): PinnedLocation => ({
            ...location,
            spaceId,
          })),
        )
        return yield* Effect.fromOption(found, () => new PinnedNodeNotFound({ bookmarkId }))
      })

      const locateBookmark = Effect.fnUntraced(function* (bookmarkId: BookmarkId) {
        const location = yield* locate(bookmarkId)
        if (location.node._tag !== "PinnedBookmark") {
          return yield* new PinnedNodeNotFound({ bookmarkId })
        }
        return location
      })

      const locateItem = Effect.fnUntraced(function* (bookmarkId: BookmarkId) {
        const location = yield* locate(bookmarkId)
        if (location.node._tag === "PinnedFolder") {
          return yield* new PinnedNodeNotFound({ bookmarkId })
        }
        return location
      })

      const locateFolder = Effect.fnUntraced(function* (folderId: BookmarkId) {
        const location = yield* locate(folderId)
        if (location.node._tag !== "PinnedFolder") {
          return yield* new PinnedNodeNotFound({ bookmarkId: folderId })
        }
        return { ...location, node: location.node }
      })

      const resolveParent = (
        parent: PinnedParent,
      ): Effect.Effect<
        { readonly folderId: BookmarkId; readonly depth: number },
        PinnedNodeNotFound | BrowserApiError
      > =>
        PinnedParent.$match(parent, {
          SpaceRoot: ({ space }) =>
            Effect.map(spaceFolders.ensureSpaceFolder(space), (folderId) => ({
              folderId,
              depth: SPACE_ROOT_DEPTH,
            })),
          Folder: ({ folderId }) =>
            Effect.map(locateFolder(folderId), ({ depth }) => ({ folderId, depth })),
        })

      const requireFolderFits = Effect.fnUntraced(function* (
        folder: PinnedFolder,
        currentDepth: number,
        to: { readonly folderId: BookmarkId; readonly depth: number },
        rule: FolderNestingRule,
      ) {
        if (folderIdsWithin(folder).includes(to.folderId)) {
          return yield* new MoveIntoDescendant({ folderId: folder.id, parentId: to.folderId })
        }
        const height = folderHeight(folder)
        const deepestAfter = to.depth + height
        const deepestNow = currentDepth + height - 1
        // Not refused just for being past the limit: nested folders made before tab group sync was
        // turned on couldn't even be reordered within their parent. Only moves deeper are refused
        if (deepestAfter > maxFolderDepth(rule) && deepestAfter > deepestNow) {
          return yield* new FolderDepthExceeded({
            depth: deepestAfter,
            maxDepth: maxFolderDepth(rule),
          })
        }
      })

      return PinnedBookmarks.of({
        loadSpaceTree: Effect.fn("PinnedBookmarks.loadSpaceTree")(function* (spaceId) {
          const unavailable = new PinnedTreeUnavailable({ spaceId })
          const subtrees = yield* Effect.mapError(spaceFolders.readSpaceSubtrees, () => unavailable)
          const marks = yield* Effect.mapError(loadMarks, () => unavailable)
          return yield* Effect.fromOption(
            Option.flatMap(Option.fromNullishOr(subtrees.get(spaceId)), (folder) =>
              pinnedTreeFrom(folder, marks),
            ),
            () => unavailable,
          )
        }),
        loadAllSpaceTrees: readableSpaceTrees.pipe(
          Effect.map(
            (spaceTrees) => new Map(spaceTrees.map(({ spaceId, tree }) => [spaceId, tree])),
          ),
          Effect.catch((error) =>
            Effect.as(Effect.logWarning("Couldn't read the pinned trees", error), new Map()),
          ),
          Effect.withSpan("PinnedBookmarks.loadAllSpaceTrees"),
        ),
        locate: Effect.fn("PinnedBookmarks.locate")(function* (bookmarkId) {
          return yield* locate(bookmarkId)
        }),
        createBookmark: Effect.fn("PinnedBookmarks.createBookmark")(function* (position, draft) {
          const parent = yield* resolveParent(position.parent)
          const created = yield* bookmarks.create({
            parentId: parent.folderId,
            title: draft.title,
            url: draft.url,
            ...atIndex(position.index),
          })
          return created.id
        }),
        createSplit: Effect.fn("PinnedBookmarks.createSplit")(function* (position, draft) {
          const parent = yield* resolveParent(position.parent)
          const folder = yield* bookmarks.create({
            parentId: parent.folderId,
            title: draft.title,
            ...atIndex(position.index),
          })
          const left = yield* bookmarks.create({ parentId: folder.id, ...draft.left })
          const right = yield* bookmarks.create({ parentId: folder.id, ...draft.right })
          yield* splitFolders.mark(folder.id)
          return { folderId: folder.id, left: left.id, right: right.id }
        }),
        createLiveFolder: Effect.fn("PinnedBookmarks.createLiveFolder")(
          function* (position, draft) {
            const parent = yield* resolveParent(position.parent)
            const created = yield* bookmarks.create({
              parentId: parent.folderId,
              title: draft.title,
              ...atIndex(position.index),
            })
            yield* liveFolders.mark(created.id, draft.source)
            yield* folderExpansion.setExpanded(created.id, true)
            return created.id
          },
        ),
        createFolder: Effect.fn("PinnedBookmarks.createFolder")(function* (position, draft, rule) {
          const parent = yield* resolveParent(position.parent)
          if (!canCreateFolderInside(parent.depth, rule)) {
            return yield* new FolderDepthExceeded({
              depth: parent.depth + 1,
              maxDepth: maxFolderDepth(rule),
            })
          }
          const created = yield* bookmarks.create({
            parentId: parent.folderId,
            title: draft.title,
            ...atIndex(position.index),
          })
          yield* folderExpansion.setExpanded(created.id, true)
          return created.id
        }),
        moveNode: Effect.fn("PinnedBookmarks.moveNode")(function* (bookmarkId, position, rule) {
          const from = yield* locate(bookmarkId)
          const to = yield* resolveParent(position.parent)
          if (from.node._tag === "PinnedFolder") {
            yield* requireFolderFits(from.node, from.depth, to, rule)
          }
          yield* bookmarks.move(bookmarkId, {
            parentId: to.folderId,
            ...atIndex(chromeMoveIndex(from, position)),
          })
        }),
        rename: Effect.fn("PinnedBookmarks.rename")(function* (bookmarkId, title) {
          yield* locate(bookmarkId)
          yield* bookmarks.update(bookmarkId, { title })
        }),
        updateBookmark: Effect.fn("PinnedBookmarks.updateBookmark")(function* (bookmarkId, draft) {
          yield* locateBookmark(bookmarkId)
          yield* bookmarks.update(bookmarkId, { title: draft.title, url: draft.url })
        }),
        removeBookmark: Effect.fn("PinnedBookmarks.removeBookmark")(function* (bookmarkId) {
          const location = yield* locateItem(bookmarkId)
          if (location.node._tag === "PinnedSplit") {
            yield* bookmarks.removeTree(bookmarkId)
            yield* splitFolders.forget([bookmarkId])
            return
          }
          if (location.node._tag === "PinnedLiveFolder") {
            yield* bookmarks.removeTree(bookmarkId)
            yield* liveFolders.forget([bookmarkId])
            yield* folderExpansion.forget([bookmarkId])
            return
          }
          yield* bookmarks.remove(bookmarkId)
        }),
        removeFolder: Effect.fn("PinnedBookmarks.removeFolder")(function* (folderId) {
          const location = yield* locateFolder(folderId)
          const folderIds = folderIdsWithin(location.node)
          const liveFolderIds = liveFoldersIn(location.node.children).map((live) => live.id)
          yield* bookmarks.removeTree(folderId)
          yield* folderExpansion.forget([...folderIds, ...liveFolderIds])
          yield* folderIcons.forget(folderIds)
          yield* splitFolders.forget(splitIdsWithin(location.node))
          // Also drops the marks of live folders that show as ordinary folders because bookmarks
          // were put in them outside Katip
          yield* liveFolders.forget([...folderIds, ...liveFolderIds])
        }),
      })
    }),
  )

  /**
   * Also provides {@link SpaceFolders}, {@link FolderExpansionStore}, {@link FolderIconStore},
   * {@link SplitFolderStore} and {@link LiveFolderStore}.
   */
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provideMerge(SpaceFolders.layer),
    Layer.provideMerge(FolderExpansionStore.layer),
    Layer.provideMerge(FolderIconStore.layer),
    Layer.provideMerge(SplitFolderStore.layer),
    Layer.provideMerge(LiveFolderStore.layer),
  )
}
