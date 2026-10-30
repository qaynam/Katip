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
  it.effect("何も保存されていなければ空", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository

      expect(yield* repository.list).toStrictEqual([])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("保存値の中に読めないエントリがあっても、残りのエントリは読める", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository
      yield* (yield* FakeBrowser).seedStorage("local", {
        [ARCHIVE_KEY]: [storedEntry("a"), { url: 42 }, storedEntry("b")],
      })

      const archive = yield* repository.list

      expect(archive.map((entry) => entry.id)).toStrictEqual(["a", "b"])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("保存値が配列でなければ空の一覧として読める", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository
      yield* (yield* FakeBrowser).seedStorage("local", { [ARCHIVE_KEY]: "corrupted" })

      expect(yield* repository.list).toStrictEqual([])
    }).pipe(Effect.provide(testLayer)),
  )
})

describe("add", () => {
  it.effect("追加したエントリが、追加した時刻とともに一覧の先頭に入る", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository
      yield* repository.add(draft("older"))
      yield* TestClock.setTime(5_000)

      yield* repository.add(draft("newer"))

      const [newest] = yield* repository.list
      expect(newest).toMatchObject({ ...draft("newer"), archivedAt: 5_000 })
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("追加するたびに別の ID が振られる", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository

      yield* repository.add(draft("a"))
      yield* repository.add(draft("b"))

      const ids = (yield* repository.list).map((entry) => entry.id)
      expect(new Set(ids).size).toBe(2)
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("同じ URL を追加すると、古いエントリは新しい情報で置き換わる", () =>
    Effect.gen(function* () {
      const repository = yield* ArchiveRepository
      yield* repository.add(draft("same", { title: "旧" }))
      yield* TestClock.setTime(1_000)

      yield* repository.add(draft("same", { title: "新", spaceId: SpaceId.make("home") }))

      const archive = yield* repository.list
      expect(archive).toHaveLength(1)
      expect(archive[0]).toMatchObject({ title: "新", spaceId: "home", archivedAt: 1_000 })
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("同時に追加しても、どの追加も失われない", () =>
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
  it.effect("削除したエントリが返り、一覧から消える", () =>
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

  it.effect("存在しないエントリを指定すると None が返り、一覧は変わらない", () =>
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
