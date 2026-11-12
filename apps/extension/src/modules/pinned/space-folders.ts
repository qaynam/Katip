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

/**
 * The title of the bookmark folder that holds a folder for each Space, by which an installation
 * without one saved takes it up.
 *
 * @remarks
 * Another title keeps a second installation in the same profile, such as a development build, from
 * taking up the folder of the first and rewriting its pins.
 */
export const RootFolderTitle = Context.Reference<string>("katip/pinned/RootFolderTitle", {
  defaultValue: () => "Katip",
})

/** Carries the name as well as the ID, since recreating the folder needs a name. */
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
     * Returns the ID of the Katip root folder.
     *
     * @remarks
     * The folder with the saved ID is used wherever it has been moved, as long as it still exists.
     * Only when it doesn't is a folder titled {@link RootFolderTitle} looked for directly inside
     * Other Bookmarks; if there is none either, one is created and its ID saved.
     */
    readonly ensureRoot: Effect.Effect<BookmarkId, BrowserApiError>
    /**
     * Returns the ID of the Space's folder, recreating it under the Space's name when it isn't
     * found directly inside the Katip root.
     */
    ensureSpaceFolder(space: SpaceFolderOwner): Effect.Effect<BookmarkId, BrowserApiError>
    /** Renames the folder to the Space's name, recreating it under that name if it is gone. */
    renameSpaceFolder(space: SpaceFolderOwner): Effect.Effect<void, BrowserApiError>
    /**
     * Removes the Space's folder with everything in it, and forgets the mapping.
     *
     * If the folder has been moved out of the Katip root, only the mapping is forgotten and the
     * folder stays.
     */
    removeSpaceFolder(spaceId: SpaceId): Effect.Effect<void, BrowserApiError>
    /**
     * Brings the Space list and the folders directly inside the Katip root in line, and returns
     * the updated Space list.
     *
     * @remarks
     * The bookmark side (created and renamed folders, and the map) is written here. The Space list
     * isn't saved, so the caller saves the returned one. A failure partway through recovers on the
     * next call by relinking the folders with the same name. A Space created from a folder without
     * a name is named with `numbered`, and the folder is renamed to match.
     */
    reconcileSpaces(
      spaces: SpaceList,
      numbered: NumberedSpaceName,
    ): Effect.Effect<SpaceList, BrowserApiError>
    /**
     * Returns the folders of the mapped Spaces that are directly inside the Katip root, loaded
     * with all their descendants.
     *
     * Empty while there is no root yet. Spaces whose folder isn't directly inside the Katip root
     * are left out.
     */
    readonly readSpaceSubtrees: Effect.Effect<ReadonlyMap<SpaceId, BookmarkFolder>, BrowserApiError>
    /**
     * Tells whether the node is the Katip root itself or inside it.
     *
     * It walks up the ancestors, so a node that has already been removed gives false. On a removal
     * event, check the parent's ID instead.
     */
    isWithinKatip(bookmarkId: BookmarkId): Effect.Effect<boolean, BrowserApiError>
  }
>()("katip/pinned/SpaceFolders") {
  static readonly layer = Layer.effect(
    SpaceFolders,
    Effect.gen(function* () {
      const bookmarks = yield* Bookmarks
      const storage = yield* Storage
      const rootFolderTitle = yield* RootFolderTitle
      const savedRootId = storedValue(storage.local, "katip/pinned/root-folder-id", BookmarkId)
      const savedSpaceFolders = storedValue(
        storage.local,
        "katip/pinned/space-folders",
        SpaceFolderMap,
      )
      // Operations that change the structure run one at a time: creating the root or folders while
      // the map is being read and written would create the same folder twice or drop map updates
      const structureLock = yield* Semaphore.make(1)
      const exclusively = <A, E>(effect: Effect.Effect<A, E>) => structureLock.withPermit(effect)

      const loadSpaceFolders = Effect.map(
        savedSpaceFolders.load,
        Option.getOrElse((): SpaceFolderMap => ({})),
      )

      // get fails the same way for a removed node as for any other reason, so the two can't be told
      // apart. Both count as missing
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
        // Older Chrome doesn't return folderType, so Other Bookmarks can't be told apart there.
        // Searching directly inside every top-level folder beats creating a new root and losing
        // track of the pins
        const searchedFolders = otherBookmarks.length > 0 ? otherBookmarks : topLevelFolders
        const existing = Array.findFirst(
          searchedFolders.flatMap(loadedChildren),
          (node) => isFolder(node) && node.title === rootFolderTitle,
        )
        if (Option.isSome(existing)) {
          return existing.value.id
        }
        const created = yield* bookmarks.create({ title: rootFolderTitle })
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
