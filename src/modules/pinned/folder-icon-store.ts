import { Array, Context, Effect, Layer, Option, Record, Schema, Semaphore } from "effect"
import { BookmarkId, Storage, type BrowserApiError } from "#platform/browser"
import { FolderIcon } from "./folder-icon"
import { storedValue } from "./stored-value"

// 値を FolderIcon として読むと、知らない名前が 1 つあるだけで全フォルダのアイコンを失う。
// 名前は文字列のまま保存し、読むときにフォルダごとに確かめる
const SavedIcons = Schema.Record(BookmarkId, Schema.String)
type SavedIcons = typeof SavedIcons.Type

const decodeIcon = Schema.decodeUnknownOption(FolderIcon)

/**
 * フォルダごとに選んだアイコン。
 *
 * @remarks
 * 分割ピンの印と同じく、ブックマークのタイトルではなくこの端末の storage に持つ。
 * アイコンを失ったフォルダは、フォルダの絵で表示されるだけで済む。
 */
export class FolderIconStore extends Context.Service<
  FolderIconStore,
  {
    /** 含まれないフォルダはフォルダの絵で表示する。 */
    readonly load: Effect.Effect<ReadonlyMap<BookmarkId, FolderIcon>, BrowserApiError>
    setIcon(folderId: BookmarkId, icon: FolderIcon): Effect.Effect<void, BrowserApiError>
    /** アイコンを選んでいないフォルダが含まれていても構わない。 */
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/pinned/FolderIconStore") {
  static readonly layer = Layer.effect(
    FolderIconStore,
    Effect.gen(function* () {
      const storage = yield* Storage
      const saved = storedValue(storage.local, "katip/pinned/folder-icons", SavedIcons)
      // 全フォルダ分を 1 つのキーに読み書きするので、並行した更新が互いを上書きしないよう直列にする
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
