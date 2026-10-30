import { Array, Clock, Context, Effect, Layer, Option, Schema, Semaphore } from "effect"
import { type BrowserApiError, Storage, type StorageArea } from "#platform/browser"
import { ArchiveEntry, ArchiveEntryId } from "./archive-entry"
import { addArchiveEntry, ArchiveList, removeArchiveEntry } from "./archive-list"

const ARCHIVE_KEY = "katip/archive"

export type ArchiveDraft = Omit<ArchiveEntry, "id" | "archivedAt">

const decodeStoredItems = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))
const decodeEntry = Schema.decodeUnknownOption(ArchiveEntry)

// 一覧をまとめて decode すると、1 件壊れただけで全件を失う。読めないエントリだけを捨てる
const decodeStored = (stored: Option.Option<unknown>): ArchiveList =>
  Option.match(Option.flatMap(stored, decodeStoredItems), {
    onNone: () => [],
    onSome: (items) => Array.getSomes(items.map((item) => decodeEntry(item))),
  })

const encodeForStorage = (archive: ArchiveList) =>
  Effect.orDie(Schema.encodeEffect(ArchiveList)(archive))

const makeArchiveRepository = Effect.fnUntraced(function* (area: StorageArea) {
  // 読んでから書くまでの間に別の書き込みが割り込むと、先に書いた側の変更が消える
  const writeLock = yield* Semaphore.make(1)

  const list = Effect.map(area.get(ARCHIVE_KEY), decodeStored)

  const save = (archive: ArchiveList) =>
    Effect.flatMap(encodeForStorage(archive), (encoded) => area.set(ARCHIVE_KEY, encoded))

  const add = Effect.fn("ArchiveRepository.add")(function* (draft: ArchiveDraft) {
    const entry: ArchiveEntry = {
      ...draft,
      id: ArchiveEntryId.make(crypto.randomUUID()),
      archivedAt: yield* Clock.currentTimeMillis,
    }
    yield* save(addArchiveEntry(yield* list, entry))
  }, Semaphore.withPermit(writeLock))

  const remove = Effect.fn("ArchiveRepository.remove")(function* (id: ArchiveEntryId) {
    const archive = yield* list
    const removed = Array.findFirst(archive, (entry) => entry.id === id)
    if (Option.isSome(removed)) {
      yield* save(removeArchiveEntry(archive, id))
    }
    return removed
  }, Semaphore.withPermit(writeLock))

  return ArchiveRepository.of({ list, add, remove })
})

export class ArchiveRepository extends Context.Service<
  ArchiveRepository,
  {
    /** アーカイブ日時の新しい順。保存値のうち読めないエントリは含めない。 */
    readonly list: Effect.Effect<ArchiveList, BrowserApiError>
    /**
     * 現在時刻と新しい ID を付けて記録する。同じ URL の既存エントリは置き換え、上限を超えた分は
     * 古いものから捨てる。
     */
    add(draft: ArchiveDraft): Effect.Effect<void, BrowserApiError>
    /** 削除したエントリを返す。該当が無ければ何も書き込まずに `None` を返す。 */
    remove(id: ArchiveEntryId): Effect.Effect<Option.Option<ArchiveEntry>, BrowserApiError>
  }
>()("katip/archive/ArchiveRepository") {
  static readonly layer = Layer.effect(
    ArchiveRepository,
    Effect.gen(function* () {
      const storage = yield* Storage
      return yield* makeArchiveRepository(storage.local)
    }),
  )
}
