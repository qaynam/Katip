import { Array, Context, Effect, Layer, Option, Record, Semaphore } from "effect"
import { Storage, type BookmarkId, type BrowserApiError } from "#platform/browser"
import { FolderExpansion } from "./folder-expansion"
import { storedValue } from "./stored-value"

export class FolderExpansionStore extends Context.Service<
  FolderExpansionStore,
  {
    readonly load: Effect.Effect<FolderExpansion, BrowserApiError>
    /** 同じフォルダへの書き込みが重なっても、最後に呼んだ値が残る。 */
    setExpanded(folderId: BookmarkId, isExpanded: boolean): Effect.Effect<void, BrowserApiError>
    /** 消したフォルダの保存値を捨てる。保存値の無いフォルダは閉じているものとして扱われる。 */
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/pinned/FolderExpansionStore") {
  static readonly layer = Layer.effect(
    FolderExpansionStore,
    Effect.gen(function* () {
      const storage = yield* Storage
      const saved = storedValue(storage.local, "katip/pinned/folder-expansion", FolderExpansion)
      // 全フォルダ分を 1 つのキーに読み書きするので、並行した更新が互いを上書きしないよう直列にする
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
