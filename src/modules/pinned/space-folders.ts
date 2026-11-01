import { Array, Context, Effect, Layer, Option, Predicate, Record, Result, Semaphore } from "effect"
import {
  addSpace,
  nextSpaceName,
  type NumberedSpaceName,
  renameSpace,
  SpaceId,
  type Space,
  type SpaceList,
  type SpaceName,
} from "#modules/space"
import {
  BookmarkId,
  Bookmarks,
  Storage,
  type BookmarkFolder,
  type BookmarkNode,
  type BrowserApiError,
} from "#platform/browser"
import {
  planSpaceFolderReconciliation,
  SpaceFolderAction,
  SpaceFolderMap,
} from "./space-folder-reconciliation"
import { storedValue } from "./stored-value"

const ROOT_FOLDER_TITLE = "Katip"

/** フォルダを作り直すときに名前が要るので、ID だけでなく名前も受け取る。 */
export type SpaceFolderOwner = Pick<Space, "id" | "name">

const isFolder = (node: BookmarkNode): node is BookmarkFolder =>
  Predicate.isTagged(node, "BookmarkFolder")

const loadedChildren = (folder: BookmarkFolder): ReadonlyArray<BookmarkNode> =>
  Option.getOrElse(folder.children, () => [])

interface Reconciliation {
  readonly spaces: SpaceList
  readonly spaceFolders: SpaceFolderMap
}

export class SpaceFolders extends Context.Service<
  SpaceFolders,
  {
    /**
     * Katip ルートフォルダの ID を返す。
     *
     * @remarks
     * 保存済みの ID のフォルダが残っていれば、どこへ移されていてもそれを使う。
     * 無いときだけ「その他のブックマーク」直下のタイトル "Katip" のフォルダを探し、それも無ければ作って ID を保存する。
     */
    readonly ensureRoot: Effect.Effect<BookmarkId, BrowserApiError>
    /** Space のフォルダの ID を返す。Katip ルート直下に見つからなければ Space 名で作り直す。 */
    ensureSpaceFolder(space: SpaceFolderOwner): Effect.Effect<BookmarkId, BrowserApiError>
    /** フォルダ名を Space 名にする。フォルダが消えていれば新しい名前で作り直す。 */
    renameSpaceFolder(space: SpaceFolderOwner): Effect.Effect<void, BrowserApiError>
    /**
     * Space のフォルダを中身ごと消し、対応を忘れる。
     *
     * フォルダが Katip ルートの外へ移されていたら、フォルダは消さずに対応だけを忘れる。
     */
    removeSpaceFolder(spaceId: SpaceId): Effect.Effect<void, BrowserApiError>
    /**
     * Space 一覧と Katip ルート直下のフォルダを一致させ、更新後の Space 一覧を返す。
     *
     * @remarks
     * ブックマーク側（フォルダの作成・改名と対応表）はここで書き込む。Space 一覧は保存しないので、
     * 返り値を呼び出し側が保存する。途中で失敗しても、次の呼び出しで同名のフォルダとの結び直しにより回復する。
     * 名前の無いフォルダから Space を作るときは、`numbered` で名前を付けてフォルダも改名する。
     */
    reconcileSpaces(
      spaces: SpaceList,
      numbered: NumberedSpaceName,
    ): Effect.Effect<SpaceList, BrowserApiError>
    /**
     * Katip ルート直下にある、対応表に載った Space のフォルダを子孫まで読み込んで返す。
     *
     * ルートが未確保なら空。フォルダが Katip ルート直下に無い Space は含まない。
     */
    readonly readSpaceSubtrees: Effect.Effect<ReadonlyMap<SpaceId, BookmarkFolder>, BrowserApiError>
    /**
     * ノードが Katip ルート自身か、その子孫かを返す。
     *
     * 祖先をたどるので、すでに削除されたノードは false になる。削除イベントでは親の ID で判定すること。
     */
    isWithinKatip(bookmarkId: BookmarkId): Effect.Effect<boolean, BrowserApiError>
  }
>()("katip/pinned/SpaceFolders") {
  static readonly layer = Layer.effect(
    SpaceFolders,
    Effect.gen(function* () {
      const bookmarks = yield* Bookmarks
      const storage = yield* Storage
      const savedRootId = storedValue(storage.local, "katip/pinned/root-folder-id", BookmarkId)
      const savedSpaceFolders = storedValue(
        storage.local,
        "katip/pinned/space-folders",
        SpaceFolderMap,
      )
      // ルートやフォルダの作成と対応表の読み書きが並行すると、同じフォルダを二重に作ったり
      // 対応表の更新を取りこぼしたりするため、構造を変える操作は 1 つずつ実行する
      const structureLock = yield* Semaphore.make(1)
      const exclusively = <A, E>(effect: Effect.Effect<A, E>) => structureLock.withPermit(effect)

      const loadSpaceFolders = Effect.map(
        savedSpaceFolders.load,
        Option.getOrElse((): SpaceFolderMap => ({})),
      )

      // get は消えたノードでもほかの理由でも同じく失敗し、区別できない。どちらも「無い」とみなす
      const findNode = (id: BookmarkId) => Effect.option(bookmarks.get(id))

      const findFolder = (id: BookmarkId) => Effect.map(findNode(id), Option.filter(isFolder))

      const findFolderUnder = (id: BookmarkId, parentId: BookmarkId) =>
        Effect.map(
          findFolder(id),
          Option.filter((folder) => Option.contains(folder.parentId, parentId)),
        )

      const findOrCreateRoot = Effect.gen(function* () {
        const topLevelFolders = loadedChildren(yield* bookmarks.getTree).filter(isFolder)
        const otherBookmarks = topLevelFolders.filter((folder) =>
          Option.contains(folder.folderType, "other"),
        )
        // folderType を返さない古い Chrome では「その他のブックマーク」を見分けられない。
        // 新しいルートを作ってピン留めを見失うよりは、最上位のどのフォルダの直下でも探すほうを選ぶ
        const searchedFolders = otherBookmarks.length > 0 ? otherBookmarks : topLevelFolders
        const existing = Array.findFirst(
          searchedFolders.flatMap(loadedChildren),
          (node) => isFolder(node) && node.title === ROOT_FOLDER_TITLE,
        )
        if (Option.isSome(existing)) {
          return existing.value.id
        }
        const created = yield* bookmarks.create({ title: ROOT_FOLDER_TITLE })
        return created.id
      })

      const ensureRootUnlocked = Effect.gen(function* () {
        const saved = yield* Effect.flatMap(
          savedRootId.load,
          Option.match({ onNone: () => Effect.succeedNone, onSome: findFolder }),
        )
        if (Option.isSome(saved)) {
          return saved.value.id
        }
        const rootId = yield* findOrCreateRoot
        yield* savedRootId.save(rootId)
        return rootId
      })

      const ensureSpaceFolderUnlocked = Effect.fnUntraced(function* (space: SpaceFolderOwner) {
        const rootId = yield* ensureRootUnlocked
        const spaceFolders = yield* loadSpaceFolders
        const linked = yield* Option.match(Record.get(spaceFolders, space.id), {
          onNone: () => Effect.succeedNone,
          onSome: (folderId) => findFolderUnder(folderId, rootId),
        })
        if (Option.isSome(linked)) {
          return linked.value.id
        }
        const created = yield* bookmarks.create({ parentId: rootId, title: space.name })
        yield* savedSpaceFolders.save(Record.set(spaceFolders, space.id, created.id))
        return created.id
      })

      const newSpaceId = Effect.sync(() => SpaceId.make(crypto.randomUUID()))

      const discoverSpace = Effect.fnUntraced(function* (
        reconciliation: Reconciliation,
        folderId: BookmarkId,
        name: Option.Option<SpaceName>,
        numbered: NumberedSpaceName,
      ) {
        const spaceId = yield* newSpaceId
        const spaces = addSpace(reconciliation.spaces, {
          id: spaceId,
          name: Option.getOrElse(name, () => nextSpaceName(reconciliation.spaces, numbered)),
        })
        const added = Array.findFirst(spaces, (space) => space.id === spaceId)
        if (Option.isNone(name) && Option.isSome(added)) {
          yield* bookmarks.update(folderId, { title: added.value.name })
        }
        return { spaces, spaceFolders: Record.set(reconciliation.spaceFolders, spaceId, folderId) }
      })

      const applyAction =
        (rootId: BookmarkId, numbered: NumberedSpaceName) =>
        (
          reconciliation: Reconciliation,
          action: SpaceFolderAction,
        ): Effect.Effect<Reconciliation, BrowserApiError> =>
          SpaceFolderAction.$match(action, {
            AdoptFolderTitle: ({ spaceId, name }) =>
              Effect.succeed({
                ...reconciliation,
                spaces: Result.getOrElse(
                  renameSpace(reconciliation.spaces, spaceId, name),
                  () => reconciliation.spaces,
                ),
              }),
            RestoreFolderTitle: ({ folderId, title }) =>
              Effect.as(bookmarks.update(folderId, { title }), reconciliation),
            RelinkFolder: ({ spaceId, folderId }) =>
              Effect.succeed({
                ...reconciliation,
                spaceFolders: Record.set(reconciliation.spaceFolders, spaceId, folderId),
              }),
            CreateSpaceFolder: ({ spaceId, title }) =>
              Effect.map(bookmarks.create({ parentId: rootId, title }), (folder) => ({
                ...reconciliation,
                spaceFolders: Record.set(reconciliation.spaceFolders, spaceId, folder.id),
              })),
            CreateSpaceFromFolder: ({ folderId, name }) =>
              discoverSpace(reconciliation, folderId, name, numbered),
            ForgetSpaceFolder: ({ spaceId }) =>
              Effect.succeed({
                ...reconciliation,
                spaceFolders: Record.remove(reconciliation.spaceFolders, spaceId),
              }),
          })

      const isSelfOrDescendant = (
        id: BookmarkId,
        ancestorId: BookmarkId,
      ): Effect.Effect<boolean> =>
        id === ancestorId
          ? Effect.succeed(true)
          : Effect.flatMap(findNode(id), (node) =>
              Option.match(
                Option.flatMap(node, (n) => n.parentId),
                {
                  onNone: () => Effect.succeed(false),
                  onSome: (parentId) => isSelfOrDescendant(parentId, ancestorId),
                },
              ),
            )

      return SpaceFolders.of({
        ensureRoot: exclusively(ensureRootUnlocked).pipe(
          Effect.withSpan("SpaceFolders.ensureRoot"),
        ),
        ensureSpaceFolder: Effect.fn("SpaceFolders.ensureSpaceFolder")(function* (space) {
          return yield* ensureSpaceFolderUnlocked(space)
        }, exclusively),
        renameSpaceFolder: Effect.fn("SpaceFolders.renameSpaceFolder")(function* (space) {
          const folderId = yield* ensureSpaceFolderUnlocked(space)
          yield* bookmarks.update(folderId, { title: space.name })
        }, exclusively),
        removeSpaceFolder: Effect.fn("SpaceFolders.removeSpaceFolder")(function* (spaceId) {
          const spaceFolders = yield* loadSpaceFolders
          const linkedFolderId = Record.get(spaceFolders, spaceId)
          if (Option.isNone(linkedFolderId)) {
            return
          }
          const rootId = yield* savedRootId.load
          const folder = yield* Option.match(rootId, {
            onNone: () => Effect.succeedNone,
            onSome: (rootId) => findFolderUnder(linkedFolderId.value, rootId),
          })
          if (Option.isSome(folder)) {
            yield* bookmarks.removeTree(folder.value.id)
          }
          yield* savedSpaceFolders.save(Record.remove(spaceFolders, spaceId))
        }, exclusively),
        reconcileSpaces: Effect.fn("SpaceFolders.reconcileSpaces")(function* (spaces, numbered) {
          const rootId = yield* ensureRootUnlocked
          const rootFolders = (yield* bookmarks.getChildren(rootId))
            .filter(isFolder)
            .map(({ id, title }) => ({ id, title }))
          const spaceFolders = yield* loadSpaceFolders
          const plan = planSpaceFolderReconciliation({ spaces, spaceFolders, rootFolders })
          const reconciled = yield* Effect.reduce(
            plan,
            () => ({ spaces, spaceFolders }),
            applyAction(rootId, numbered),
          )
          if (reconciled.spaceFolders !== spaceFolders) {
            yield* savedSpaceFolders.save(reconciled.spaceFolders)
          }
          return reconciled.spaces
        }, exclusively),
        readSpaceSubtrees: Effect.gen(function* () {
          const rootId = yield* savedRootId.load
          if (Option.isNone(rootId)) {
            return new Map()
          }
          const root = yield* bookmarks.getSubTree(rootId.value)
          const rootFolders = isFolder(root) ? loadedChildren(root).filter(isFolder) : []
          const spaceFolders = yield* loadSpaceFolders
          return new Map(
            Array.getSomes(
              Record.toEntries(spaceFolders).map(([spaceId, folderId]) =>
                Option.map(
                  Array.findFirst(rootFolders, (folder) => folder.id === folderId),
                  (folder) => [spaceId, folder] as const,
                ),
              ),
            ),
          )
        }).pipe(Effect.withSpan("SpaceFolders.readSpaceSubtrees")),
        isWithinKatip: Effect.fn("SpaceFolders.isWithinKatip")(function* (bookmarkId) {
          const rootId = yield* savedRootId.load
          return yield* Option.match(rootId, {
            onNone: () => Effect.succeed(false),
            onSome: (rootId) => isSelfOrDescendant(bookmarkId, rootId),
          })
        }),
      })
    }),
  )
}
