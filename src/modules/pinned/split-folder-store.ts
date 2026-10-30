import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect"
import { BookmarkId, Storage, type BrowserApiError } from "#platform/browser"
import { storedValue } from "./stored-value"

const SplitFolderIds = Schema.Array(BookmarkId)

/**
 * 分割ビューとしてピン留めしたフォルダの印。
 *
 * @remarks
 * 印はブックマークのタイトルではなくこの端末の storage に持つ。タイトルに記号を入れると
 * ブックマークマネージャや他の端末での表示が汚れるため。印を失ったフォルダは、中身の
 * 2 つのブックマークを持つ普通のフォルダとして表示されるだけで、ピンは失われない。
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
      // 全フォルダ分を 1 つのキーに読み書きするので、並行した更新が互いを上書きしないよう直列にする
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
