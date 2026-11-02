import { Array, Context, Effect, Layer, Option, Record, Schema, Semaphore } from "effect"
import { LiveSource } from "#modules/live-folders"
import { BookmarkId, Storage, type BrowserApiError } from "#platform/browser"
import { storedValue } from "./stored-value"

const LiveFolderSources = Schema.Record(BookmarkId, LiveSource)
type LiveFolderSources = typeof LiveFolderSources.Type

/**
 * The marks on folders created as live folders, each with the source it fetches from.
 *
 * @remarks
 * Like the split pin marks, these are kept in this device's storage, not in the bookmark titles.
 * A folder that loses its mark shows as an empty ordinary folder.
 */
export class LiveFolderStore extends Context.Service<
  LiveFolderStore,
  {
    readonly load: Effect.Effect<ReadonlyMap<BookmarkId, LiveSource>, BrowserApiError>
    mark(folderId: BookmarkId, source: LiveSource): Effect.Effect<void, BrowserApiError>
    /** Folders without a mark may be included. */
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/pinned/LiveFolderStore") {
  static readonly layer = Layer.effect(
    LiveFolderStore,
    Effect.gen(function* () {
      const storage = yield* Storage
      const saved = storedValue(storage.local, "katip/pinned/live-folders", LiveFolderSources)
      // Every folder is read and written under one key, so updates run one at a time to keep
      // concurrent ones from overwriting each other
      const writeLock = yield* Semaphore.make(1)

      const loadSources = Effect.map(
        saved.load,
        Option.getOrElse((): LiveFolderSources => ({})),
      )
      const update = (change: (sources: LiveFolderSources) => LiveFolderSources) =>
        writeLock.withPermit(Effect.flatMap(loadSources, (sources) => saved.save(change(sources))))

      return LiveFolderStore.of({
        load: Effect.map(
          loadSources,
          (sources): ReadonlyMap<BookmarkId, LiveSource> => new Map(Record.toEntries(sources)),
        ),
        mark: (folderId, source) => update((sources) => Record.set(sources, folderId, source)),
        forget: (folderIds) =>
          update((sources) =>
            Array.reduce(folderIds, sources, (remaining, folderId) =>
              Record.remove(remaining, folderId),
            ),
          ),
      })
    }),
  )
}
