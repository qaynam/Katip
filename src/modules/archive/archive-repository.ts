import { Array, Clock, Context, Effect, Layer, Option, Schema, Semaphore } from "effect"
import { type BrowserApiError, Storage, type StorageArea } from "#platform/browser"
import { ArchiveEntry, ArchiveEntryId } from "./archive-entry"
import { addArchiveEntry, ArchiveList, removeArchiveEntry } from "./archive-list"

const ARCHIVE_KEY = "katip/archive"

export type ArchiveDraft = Omit<ArchiveEntry, "id" | "archivedAt">

const decodeStoredItems = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))
const decodeEntry = Schema.decodeUnknownOption(ArchiveEntry)

// Not decoding the list as a whole: one broken entry would lose them all. Only unreadable entries
// are dropped
const decodeStored = (stored: Option.Option<unknown>): ArchiveList =>
  Option.match(Option.flatMap(stored, decodeStoredItems), {
    onNone: () => [],
    onSome: (items) => Array.getSomes(items.map((item) => decodeEntry(item))),
  })

const encodeForStorage = (archive: ArchiveList) =>
  Effect.orDie(Schema.encodeEffect(ArchiveList)(archive))

const makeArchiveRepository = Effect.fnUntraced(function* (area: StorageArea) {
  // Another write slipping in between the read and the write would lose the earlier write
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
    /** Most recently archived first. Stored entries that can't be read are left out. */
    readonly list: Effect.Effect<ArchiveList, BrowserApiError>
    /**
     * Records the draft with the current time and a new ID. It replaces an existing entry with the
     * same URL, and the oldest entries beyond the capacity are dropped.
     */
    add(draft: ArchiveDraft): Effect.Effect<void, BrowserApiError>
    /** Returns the removed entry, or `None` without writing anything when there's no such entry. */
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
