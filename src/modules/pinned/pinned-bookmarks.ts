import { Array, Context, Data, Effect, Layer, Option } from "effect"
import type { SpaceId } from "#modules/space"
import { Bookmarks, type BookmarkId, type BrowserApiError } from "#platform/browser"
import {
  canCreateFolderInside,
  maxFolderDepth,
  SPACE_ROOT_DEPTH,
  type FolderNestingRule,
} from "./folder-depth"
import { FolderExpansionStore } from "./folder-expansion-store"
import { FolderDepthExceeded, PinnedNodeNotFound, PinnedTreeUnavailable } from "./pinned-errors"
import {
  findPinnedNode,
  folderIdsWithin,
  pinnedTreeFrom,
  type PinnedNodeLocation,
  type PinnedTree,
} from "./pinned-node"
import { SpaceFolders, type SpaceFolderOwner } from "./space-folders"

export type PinnedParent = Data.TaggedEnum<{
  /** Space フォルダの直下。フォルダが消えていれば作り直すので、Space 名も受け取る。 */
  SpaceRoot: { readonly space: SpaceFolderOwner }
  Folder: { readonly folderId: BookmarkId }
}>
export const PinnedParent = Data.taggedEnum<PinnedParent>()

export interface PinnedPosition {
  readonly parent: PinnedParent
  /** 作成・移動した後に、親の子の中で占める位置。省略時は末尾。 */
  readonly index?: number
}

export interface PinnedLocation extends PinnedNodeLocation {
  readonly spaceId: SpaceId
}

export interface PinnedBookmarkDraft {
  readonly title: string
  readonly url: string
}

const atIndex = (index: number | undefined) => (index === undefined ? {} : { index })

const isSameParent = (location: PinnedLocation, parent: PinnedParent): boolean =>
  PinnedParent.$match(parent, {
    SpaceRoot: ({ space }) =>
      location.spaceId === space.id && Option.isNone(location.parentFolderId),
    Folder: ({ folderId }) => Option.contains(location.parentFolderId, folderId),
  })

// Chrome の move の index は移動するノード自身を含めた移動前の並びで数えるため、
// 同じ親の中で後ろへ動かすときは 1 つ先を指さないと、目的の位置の 1 つ手前に入る
const chromeMoveIndex = (from: PinnedLocation, to: PinnedPosition): number | undefined =>
  to.index !== undefined && isSameParent(from, to.parent) && from.index < to.index
    ? to.index + 1
    : to.index

export class PinnedBookmarks extends Context.Service<
  PinnedBookmarks,
  {
    /** 部分的に読めた結果は返さず、すべて読めなければ {@link PinnedTreeUnavailable} で失敗する。 */
    loadSpaceTree(spaceId: SpaceId): Effect.Effect<PinnedTree, PinnedTreeUnavailable>
    /** 読めた Space のツリーだけを返す。含まれない Space は読めなかったものとして扱う。 */
    readonly loadAllSpaceTrees: Effect.Effect<ReadonlyMap<SpaceId, PinnedTree>>
    /**
     * ノードがどの Space のどこにあるかを返す。
     *
     * Katip の Space フォルダ配下に無ければ、同じ ID のブックマークが Katip の外にあっても見つからない。
     */
    locate(
      bookmarkId: BookmarkId,
    ): Effect.Effect<PinnedLocation, PinnedNodeNotFound | BrowserApiError>
    createBookmark(
      position: PinnedPosition,
      draft: PinnedBookmarkDraft,
    ): Effect.Effect<BookmarkId, PinnedNodeNotFound | BrowserApiError>
    /** 作ったフォルダは開いた状態で保存する。 */
    createFolder(
      position: PinnedPosition,
      draft: { readonly title: string },
      rule: FolderNestingRule,
    ): Effect.Effect<BookmarkId, PinnedNodeNotFound | FolderDepthExceeded | BrowserApiError>
    /** 別の Space へも移せる。フォルダは移せない。 */
    moveBookmark(
      bookmarkId: BookmarkId,
      position: PinnedPosition,
    ): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
    /** ブックマークとフォルダのどちらにも使える。Space フォルダの改名は {@link SpaceFolders} で行う。 */
    rename(
      bookmarkId: BookmarkId,
      title: string,
    ): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
    updateBookmark(
      bookmarkId: BookmarkId,
      draft: PinnedBookmarkDraft,
    ): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
    removeBookmark(
      bookmarkId: BookmarkId,
    ): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
    /** 中身ごと消し、配下のフォルダの開閉状態も捨てる。 */
    removeFolder(folderId: BookmarkId): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
  }
>()("katip/pinned/PinnedBookmarks") {
  static readonly layerNoDeps = Layer.effect(
    PinnedBookmarks,
    Effect.gen(function* () {
      const bookmarks = yield* Bookmarks
      const spaceFolders = yield* SpaceFolders
      const folderExpansion = yield* FolderExpansionStore

      const readableSpaceTrees = Effect.map(spaceFolders.readSpaceSubtrees, (subtrees) =>
        Array.getSomes(
          Array.fromIterable(subtrees).map(([spaceId, folder]) =>
            Option.map(pinnedTreeFrom(folder), (tree) => ({ spaceId, tree })),
          ),
        ),
      )

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

      return PinnedBookmarks.of({
        loadSpaceTree: Effect.fn("PinnedBookmarks.loadSpaceTree")(function* (spaceId) {
          const unavailable = new PinnedTreeUnavailable({ spaceId })
          const subtrees = yield* Effect.mapError(spaceFolders.readSpaceSubtrees, () => unavailable)
          return yield* Effect.fromOption(
            Option.flatMap(Option.fromNullishOr(subtrees.get(spaceId)), pinnedTreeFrom),
            () => unavailable,
          )
        }),
        loadAllSpaceTrees: readableSpaceTrees.pipe(
          Effect.map(
            (spaceTrees) => new Map(spaceTrees.map(({ spaceId, tree }) => [spaceId, tree])),
          ),
          Effect.catch((error) =>
            Effect.as(Effect.logWarning("ピン留めツリーを読めない", error), new Map()),
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
        moveBookmark: Effect.fn("PinnedBookmarks.moveBookmark")(function* (bookmarkId, position) {
          const from = yield* locateBookmark(bookmarkId)
          const to = yield* resolveParent(position.parent)
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
          yield* locateBookmark(bookmarkId)
          yield* bookmarks.remove(bookmarkId)
        }),
        removeFolder: Effect.fn("PinnedBookmarks.removeFolder")(function* (folderId) {
          const location = yield* locateFolder(folderId)
          yield* bookmarks.removeTree(folderId)
          yield* folderExpansion.forget(folderIdsWithin(location.node))
        }),
      })
    }),
  )

  /** {@link SpaceFolders} と {@link FolderExpansionStore} も合わせて提供する。 */
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provideMerge(SpaceFolders.layer),
    Layer.provideMerge(FolderExpansionStore.layer),
  )
}
