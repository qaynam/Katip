import { Array, Context, Effect, Layer, Option, Record, Schema, Semaphore } from "effect"
import { LiveSource } from "#modules/live-folders"
import { BookmarkId, Storage, type BrowserApiError } from "#platform/browser"
import { storedValue } from "./stored-value"

const LiveFolderSources = Schema.Record(BookmarkId, LiveSource)
type LiveFolderSources = typeof LiveFolderSources.Type

/**
 * ライブフォルダとして作ったフォルダの印と、その取得元。
 *
 * @remarks
 * 分割ピンの印と同じく、ブックマークのタイトルではなくこの端末の storage に持つ。
 * 印を失ったフォルダは、空の普通のフォルダとして表示される。
 */
export class LiveFolderStore extends Context.Service<
  LiveFolderStore,
  {
    readonly load: Effect.Effect<ReadonlyMap<BookmarkId, LiveSource>, BrowserApiError>
    mark(folderId: BookmarkId, source: LiveSource): Effect.Effect<void, BrowserApiError>
    /** 印の無いフォルダが含まれていても構わない。 */
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/pinned/LiveFolderStore") {
  static readonly layer = Layer.effect(
    LiveFolderStore,
    Effect.gen(function* () {
      const storage = yield* Storage
      const saved = storedValue(storage.local, "katip/pinned/live-folders", LiveFolderSources)
      // 全フォルダ分を 1 つのキーに読み書きするので、並行した更新が互いを上書きしないよう直列にする
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
