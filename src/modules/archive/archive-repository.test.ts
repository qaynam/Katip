import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { SpaceId } from "#modules/space"
import { FakeBrowser } from "#platform/browser-testing"
import { ArchiveEntry, ArchiveEntryId } from "./archive-entry"
import { ArchiveRepository, type ArchiveDraft } from "./archive-repository"

const ARCHIVE_KEY = "katip/archive"

const testLayer = ArchiveRepository.layer.pipe(Layer.provideMerge(FakeBrowser.layer))

const draft = (path: string, overrides: Partial<ArchiveDraft> = {}): ArchiveDraft => ({
  url: `https://example.com/${path}`,
  title: path,
  spaceId: SpaceId.make("work"),
  ...overrides,
})

const storedEntry = (id: string): typeof ArchiveEntry.Encoded =>
  Schema.encodeSync(ArchiveEntry)({
    id: ArchiveEntryId.make(id),
    url: `https://example.com/${id}`,
    title: id,
    spaceId: SpaceId.make("work"),
    archivedAt: 0,
  })

describe("list", () => {
  it.effect("is empty when nothing is stored", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository

      expect(yield* repository.list).toStrictEqual([])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("reads the remaining entries even when some stored entries can't be read", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository
      yield* (yield* FakeBrowser).seedStorage("local", {
        [ARCHIVE_KEY]: [storedEntry("a"), { url: 42 }, storedEntry("b")],
      })

      const archive = yield* repository.list

      expect(archive.map((entry) => entry.id)).toStrictEqual(["a", "b"])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("reads a stored value that isn't an array as an empty list", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository
      yield* (yield* FakeBrowser).seedStorage("local", { [ARCHIVE_KEY]: "corrupted" })

      expect(yield* repository.list).toStrictEqual([])
    }).pipe(Effect.provide(testLayer)),
  )
})

describe("add", () => {
  it.effect("puts the added entry first in the list, with the time it was added", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository
      yield* repository.add(draft("older"))
      yield* TestClock.setTime(5_000)

      yield* repository.add(draft("newer"))

      const [newest] = yield* repository.list
      expect(newest).toMatchObject({ ...draft("newer"), archivedAt: 5_000 })
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("gives every added entry a different ID", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository

      yield* repository.add(draft("a"))
      yield* repository.add(draft("b"))

      const ids = (yield* repository.list).map((entry) => entry.id)
      expect(new Set(ids).size).toBe(2)
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("replaces the old entry with the new details when the same URL is added", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository
      yield* repository.add(draft("same", { title: "Old" }))
      yield* TestClock.setTime(1_000)

      yield* repository.add(draft("same", { title: "New", spaceId: SpaceId.make("home") }))

      const archive = yield* repository.list
      expect(archive).toHaveLength(1)
      expect(archive[0]).toMatchObject({ title: "New", spaceId: "home", archivedAt: 1_000 })
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("loses none of several concurrent additions", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository

      yield* Effect.all([draft("a"), draft("b"), draft("c")].map(repository.add), {
        concurrency: "unbounded",
      })

      expect(yield* repository.list).toHaveLength(3)
    }).pipe(Effect.provide(testLayer)),
  )
})

describe("remove", () => {
  it.effect("returns the removed entry and drops it from the list", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository
      yield* repository.add(draft("keep"))
      yield* repository.add(draft("drop"))
      const target = Option.getOrThrow(
        Array.findFirst(yield* repository.list, (entry) => entry.title === "drop"),
      )

      const removed = yield* repository.remove(target.id)

      expect(Option.getOrNull(removed)).toStrictEqual(target)
      expect((yield* repository.list).map((entry) => entry.title)).toStrictEqual(["keep"])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("returns None for an entry that doesn't exist and leaves the list as it is", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository
      yield* repository.add(draft("keep"))
      const before = yield* repository.list

      const removed = yield* repository.remove(ArchiveEntryId.make("missing"))

      expect(Option.isNone(removed)).toBe(true)
      expect(yield* repository.list).toStrictEqual(before)
    }).pipe(Effect.provide(testLayer)),
  )
})
