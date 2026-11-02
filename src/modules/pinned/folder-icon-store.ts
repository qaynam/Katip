import { Array, Context, Effect, Layer, Option, Record, Schema, Semaphore } from "effect"
import { BookmarkId, Storage, type BrowserApiError } from "#platform/browser"
import { FolderIcon } from "./folder-icon"
import { storedValue } from "./stored-value"

// Not read as FolderIcon values: a single unknown name would fail the whole record and lose every
// folder's icon. Names are saved as plain strings and checked folder by folder when read
const SavedIcons = Schema.Record(BookmarkId, Schema.String)
type SavedIcons = typeof SavedIcons.Type

const decodeIcon = Schema.decodeUnknownOption(FolderIcon)

/**
 * The icon chosen for each folder.
 *
 * @remarks
 * Like the split pin marks, these are kept in this device's storage, not in the bookmark titles.
 * A folder that loses its icon just shows with the folder picture.
 */
export class FolderIconStore extends Context.Service<
  FolderIconStore,
  {
    /** Folders missing from the map show with the folder picture. */
    readonly load: Effect.Effect<ReadonlyMap<BookmarkId, FolderIcon>, BrowserApiError>
    setIcon(folderId: BookmarkId, icon: FolderIcon): Effect.Effect<void, BrowserApiError>
    /** Folders with no icon chosen may be included. */
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/pinned/FolderIconStore") {
  static readonly layer = Layer.effect(
    FolderIconStore,
    Effect.gen(function* () {
      const storage = yield* Storage
      const saved = storedValue(storage.local, "katip/pinned/folder-icons", SavedIcons)
      // Every folder is read and written under one key, so updates run one at a time to keep
      // concurrent ones from overwriting each other
      const writeLock = yield* Semaphore.make(1)

      const loadSaved = Effect.map(
        saved.load,
        Option.getOrElse((): SavedIcons => ({})),
      )
      const update = (change: (icons: SavedIcons) => SavedIcons) =>
        writeLock.withPermit(Effect.flatMap(loadSaved, (icons) => saved.save(change(icons))))

      return FolderIconStore.of({
        load: Effect.map(
          loadSaved,
          (icons): ReadonlyMap<BookmarkId, FolderIcon> =>
            new Map(
              Array.getSomes(
                Record.toEntries(icons).map(([folderId, name]) =>
                  Option.map(decodeIcon(name), (icon) => [folderId, icon] as const),
                ),
              ),
            ),
        ),
        setIcon: (folderId, icon) => update((icons) => Record.set(icons, folderId, icon)),
        forget: (folderIds) =>
          update((icons) =>
            Array.reduce(folderIds, icons, (remaining, folderId) =>
              Record.remove(remaining, folderId),
            ),
          ),
      })
    }),
  )
}
