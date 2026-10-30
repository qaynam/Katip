import { Context, Effect, Layer, Option, Record, Schema } from "effect"
import { BookmarkId, Storage, type BrowserApiError } from "#platform/browser"
import { makePersistedRef } from "#platform/persisted-ref"
import { LiveFolderRecord } from "./live-folder-record"

const LiveFolderRecords = Schema.Record(BookmarkId, LiveFolderRecord)
type LiveFolderRecords = typeof LiveFolderRecords.Type

/**
 * ライブフォルダの中身を、ブックマークではなくこの端末の storage に持つ。
 *
 * @remarks
 * 取得のたびにブックマークを書き換えると、ブックマークの変更イベントと Chrome Sync の
 * 同期が数分おきに走り続ける。中身は取得し直せば戻るので、端末ごとのキャッシュで足りる。
 */
export class LiveFolderCache extends Context.Service<
  LiveFolderCache,
  {
    readonly all: Effect.Effect<ReadonlyMap<BookmarkId, LiveFolderRecord>>
    get(folderId: BookmarkId): Effect.Effect<Option.Option<LiveFolderRecord>>
    save(
      folderId: BookmarkId,
      next: (previous: Option.Option<LiveFolderRecord>) => LiveFolderRecord,
    ): Effect.Effect<void, BrowserApiError>
    /** 記録の無いフォルダには何もしない。 */
    modify(
      folderId: BookmarkId,
      change: (record: LiveFolderRecord) => LiveFolderRecord,
    ): Effect.Effect<void, BrowserApiError>
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
    /** `folderIds` に含まれないフォルダの記録を捨てる。 */
    retainOnly(folderIds: ReadonlySet<BookmarkId>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/live-folders/LiveFolderCache") {
  static readonly layer = Layer.effect(
    LiveFolderCache,
    Effect.gen(function* () {
      const storage = yield* Storage
      const records = yield* makePersistedRef({
        area: storage.local,
        key: "katip/live-folders/records",
        schema: LiveFolderRecords,
        initial: (): LiveFolderRecords => ({}),
      })
      const get = (folderId: BookmarkId) =>
        Effect.map(records.get, (all) => Record.get(all, folderId))

      const removeWhere = (shouldRemove: (folderId: BookmarkId) => boolean) =>
        Effect.flatMap(records.get, (all) =>
          Object.keys(all).some((id) => shouldRemove(BookmarkId.make(id)))
            ? records.update((current) =>
                Record.filter(current, (_, id) => !shouldRemove(BookmarkId.make(id))),
              )
            : Effect.void,
        )

      return LiveFolderCache.of({
        all: Effect.map(
          records.get,
          (all) =>
            new Map(Object.entries(all).map(([id, record]) => [BookmarkId.make(id), record])),
        ),
        get,
        save: (folderId, next) =>
          Effect.asVoid(
            records.update((all) => Record.set(all, folderId, next(Record.get(all, folderId)))),
          ),
        modify: (folderId, change) =>
          Effect.flatMap(get(folderId), (record) =>
            Option.isNone(record)
              ? Effect.void
              : Effect.asVoid(
                  records.update((all) =>
                    Option.match(Record.get(all, folderId), {
                      onNone: () => all,
                      onSome: (current) => Record.set(all, folderId, change(current)),
                    }),
                  ),
                ),
          ),
        forget: (folderIds) => removeWhere((id) => folderIds.includes(id)),
        retainOnly: (folderIds) => removeWhere((id) => !folderIds.has(id)),
      })
    }),
  )
}
