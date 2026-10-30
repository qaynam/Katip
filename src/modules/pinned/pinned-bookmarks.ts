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
    /**
     * 分割ビューとしてピン留めする。2 つのブックマークを入れたフォルダを作り、分割の印を付ける。
     *
     * フォルダの深さ制限は受けない（ユーザーが中身を整理するフォルダではなく、1 つのピンとして扱う）。
     */
    createSplit(
      position: PinnedPosition,
      draft: PinnedSplitDraft,
    ): Effect.Effect<CreatedSplit, PinnedNodeNotFound | BrowserApiError>
    /**
     * ライブフォルダを作る。空のフォルダを作り、ライブフォルダの印と取得元を付け、開いた状態で保存する。
     *
     * フォルダの深さ制限は受けない（中身をユーザーが整理するフォルダではなく、1 つのピンとして扱う）。
     */
    createLiveFolder(
      position: PinnedPosition,
      draft: PinnedLiveFolderDraft,
    ): Effect.Effect<BookmarkId, PinnedNodeNotFound | BrowserApiError>
    /** 作ったフォルダは開いた状態で保存する。 */
    createFolder(
      position: PinnedPosition,
      draft: { readonly title: string },
      rule: FolderNestingRule,
    ): Effect.Effect<BookmarkId, PinnedNodeNotFound | FolderDepthExceeded | BrowserApiError>
    /**
     * ピン留めのノード（ブックマーク・分割ピン・ライブフォルダ・フォルダ）を移す。別の Space へも移せる。
     *
     * フォルダは、移した後に配下のいちばん深いフォルダが `rule` の深さの上限を超え、かつ今より
     * 深くなるなら {@link FolderDepthExceeded} で断る。今すでに上限より深いフォルダでも、同じ深さか
     * 浅い所へは移せる。自身や配下のフォルダの中へは {@link MoveIntoDescendant} で断る。
     */
    moveNode(
      bookmarkId: BookmarkId,
      position: PinnedPosition,
      rule: FolderNestingRule,
    ): Effect.Effect<
      void,
      PinnedNodeNotFound | FolderDepthExceeded | MoveIntoDescendant | BrowserApiError
    >
    /** ブックマークとフォルダのどちらにも使える。Space フォルダの改名は {@link SpaceFolders} で行う。 */
    rename(
      bookmarkId: BookmarkId,
      title: string,
    ): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
    updateBookmark(
      bookmarkId: BookmarkId,
      draft: PinnedBookmarkDraft,
    ): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
    /**
     * ブックマーク・分割ピン・ライブフォルダを削除する。分割ピンは中の 2 つのブックマークごと消える。
     * ライブフォルダは印と開閉状態も捨てる（取得した中身のキャッシュは呼び出し側で捨てる）。
     */
    removeBookmark(
      bookmarkId: BookmarkId,
    ): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
    /** 中身ごと消し、配下のフォルダの開閉状態と、配下の分割ピン・ライブフォルダの印も捨てる。 */
    removeFolder(folderId: BookmarkId): Effect.Effect<void, PinnedNodeNotFound | BrowserApiError>
  }
>()("katip/pinned/PinnedBookmarks") {
  static readonly layerNoDeps = Layer.effect(
    PinnedBookmarks,
    Effect.gen(function* () {
      const bookmarks = yield* Bookmarks
      const spaceFolders = yield* SpaceFolders
      const folderExpansion = yield* FolderExpansionStore
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
        // 上限を超えるかだけで断ると、タブグループ同期を ON にする前に作った入れ子のフォルダを
        // 同じ親の中で並べ替えることすらできなくなる。今より深くする移動だけを断る
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
          yield* splitFolders.forget(splitIdsWithin(location.node))
          // 外でブックマークを入れられて普通のフォルダとして見えているライブフォルダの印も残さない
          yield* liveFolders.forget([...folderIds, ...liveFolderIds])
        }),
      })
    }),
  )

  /**
   * {@link SpaceFolders}、{@link FolderExpansionStore}、{@link SplitFolderStore}、
   * {@link LiveFolderStore} も合わせて提供する。
   */
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provideMerge(SpaceFolders.layer),
    Layer.provideMerge(FolderExpansionStore.layer),
    Layer.provideMerge(SplitFolderStore.layer),
    Layer.provideMerge(LiveFolderStore.layer),
  )
}
