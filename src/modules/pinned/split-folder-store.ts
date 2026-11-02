import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect"
import { BookmarkId, Storage, type BrowserApiError } from "#platform/browser"
import { storedValue } from "./stored-value"

const SplitFolderIds = Schema.Array(BookmarkId)

/**
 * The marks on folders pinned as a split view.
 *
 * @remarks
 * The marks are kept in this device's storage, not in the bookmark titles: a symbol in a title
 * would clutter it in the bookmark manager and on other devices. A folder that loses its mark
 * just shows as an ordinary folder holding the two bookmarks; the pins aren't lost.
 */
export class SplitFolderStore extends Context.Service<
  SplitFolderStore,
  {
    readonly load: Effect.Effect<ReadonlySet<BookmarkId>, BrowserApiError>
    mark(folderId: BookmarkId): Effect.Effect<void, BrowserApiError>
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/pinned/SplitFolderStore") {
  static readonly layer = Layer.effect(
    SplitFolderStore,
    Effect.gen(function* () {
      const storage = yield* Storage
      const saved = storedValue(storage.local, "katip/pinned/split-folders", SplitFolderIds)
      // Every folder is read and written under one key, so updates run one at a time to keep
      // concurrent ones from overwriting each other
      const writeLock = yield* Semaphore.make(1)

      const load = Effect.map(
        saved.load,
        (ids): ReadonlySet<BookmarkId> => new Set(Option.getOrElse(ids, () => [])),
      )
      const update = (change: (ids: ReadonlySet<BookmarkId>) => ReadonlySet<BookmarkId>) =>
        writeLock.withPermit(Effect.flatMap(load, (ids) => saved.save([...change(ids)])))

      return SplitFolderStore.of({
        load,
        mark: (folderId) => update((ids) => new Set([...ids, folderId])),
        forget: (folderIds) =>
          update((ids) => new Set([...ids].filter((id) => !folderIds.includes(id)))),
      })
    }),
  )
}
