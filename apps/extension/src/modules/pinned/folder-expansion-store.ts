import { Array, Context, Effect, Layer, Option, Record, Semaphore } from "effect"
import { Storage, type BookmarkId, type BrowserApiError } from "#platform/browser"
import { FolderExpansion } from "./folder-expansion"
import { storedValue } from "./stored-value"

export class FolderExpansionStore extends Context.Service<
  FolderExpansionStore,
  {
    readonly load: Effect.Effect<FolderExpansion, BrowserApiError>
    /** When writes for the same folder overlap, the value of the last call wins. */
    setExpanded(folderId: BookmarkId, isExpanded: boolean): Effect.Effect<void, BrowserApiError>
    /**
     * Drops the saved values of removed folders. A folder with no saved value counts as collapsed.
     */
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/pinned/FolderExpansionStore") {
  static readonly layer = Layer.effect(
    FolderExpansionStore,
    Effect.gen(function* () {
      const storage = yield* Storage
      const saved = storedValue(storage.local, "katip/pinned/folder-expansion", FolderExpansion)
      // Every folder is read and written under one key, so updates run one at a time to keep
      // concurrent ones from overwriting each other
      const writeLock = yield* Semaphore.make(1)

      const load = Effect.map(
        saved.load,
        Option.getOrElse((): FolderExpansion => ({})),
      )
      const update = (change: (expansion: FolderExpansion) => FolderExpansion) =>
        writeLock.withPermit(Effect.flatMap(load, (expansion) => saved.save(change(expansion))))

      return FolderExpansionStore.of({
        load,
        setExpanded: (folderId, isExpanded) =>
          update((expansion) => Record.set(expansion, folderId, isExpanded)),
        forget: (folderIds) =>
          update((expansion) =>
            Array.reduce(folderIds, expansion, (remaining, folderId) =>
              Record.remove(remaining, folderId),
            ),
          ),
      })
    }),
  )
}
