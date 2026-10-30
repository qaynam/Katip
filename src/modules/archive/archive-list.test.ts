import { Array } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { ArchiveEntryId, type ArchiveEntry } from "./archive-entry"
import {
  addArchiveEntry,
  ARCHIVE_CAPACITY,
  archiveEntriesInSpace,
  removeArchiveEntry,
  type ArchiveList,
} from "./archive-list"

const entry = (id: string, overrides: Partial<Omit<ArchiveEntry, "id">> = {}): ArchiveEntry => ({
  id: ArchiveEntryId.make(id),
  url: `https://example.com/${id}`,
  title: id,
  spaceId: SpaceId.make("work"),
  archivedAt: 0,
  ...overrides,
})

const idsOf = (archive: ArchiveList) => archive.map((e) => e.id)

describe("addArchiveEntry", () => {
  it("追加したエントリが先頭に来る", () => {
    const archive = [entry("older", { archivedAt: 100 })]

    const added = addArchiveEntry(archive, entry("newer", { archivedAt: 200 }))

    expect(idsOf(added)).toStrictEqual(["newer", "older"])
  })

  it("既存より古い日時のエントリを追加しても、アーカイブ日時の新しい順に並ぶ", () => {
    const archive = [entry("b", { archivedAt: 300 }), entry("a", { archivedAt: 100 })]

    const added = addArchiveEntry(archive, entry("middle", { archivedAt: 200 }))

    expect(idsOf(added)).toStrictEqual(["b", "middle", "a"])
  })

  it("同じ URL のエントリがあると、古いエントリは消えて新しい情報だけが残る", () => {
    const url = "https://example.com/same"
    const archive = [entry("old", { url, title: "旧", archivedAt: 100 })]
    const newer = entry("new", { url, title: "新", spaceId: SpaceId.make("home"), archivedAt: 200 })

    const added = addArchiveEntry(archive, newer)

    expect(added).toStrictEqual([newer])
  })

  it("URL が違えば同じタイトルでも別のエントリとして残る", () => {
    const archive = [entry("a", { title: "同名", archivedAt: 100 })]

    const added = addArchiveEntry(archive, entry("b", { title: "同名", archivedAt: 200 }))

    expect(idsOf(added)).toStrictEqual(["b", "a"])
  })

  it.each(["", "   "])("タイトルが空（%j）なら URL がタイトルになる", (title) => {
    const added = addArchiveEntry([], entry("a", { url: "https://example.com/x", title }))

    expect(added[0]?.title).toBe("https://example.com/x")
  })

  it(`${ARCHIVE_CAPACITY} 件を超えると、最も古いエントリから捨てられる`, () => {
    const full = Array.makeBy(ARCHIVE_CAPACITY, (i) =>
      entry(`e${i}`, { archivedAt: ARCHIVE_CAPACITY - i }),
    )

    const added = addArchiveEntry(full, entry("newest", { archivedAt: ARCHIVE_CAPACITY + 1 }))

    expect(added).toHaveLength(ARCHIVE_CAPACITY)
    expect(added[0]?.id).toBe("newest")
    expect(added.some((e) => e.id === `e${ARCHIVE_CAPACITY - 1}`)).toBe(false)
  })

  it(`${ARCHIVE_CAPACITY} 件ちょうどでも、同じ URL の置き換えなら他のエントリは捨てられない`, () => {
    const full = Array.makeBy(ARCHIVE_CAPACITY, (i) =>
      entry(`e${i}`, { archivedAt: ARCHIVE_CAPACITY - i }),
    )
    const replacing = entry("replacing", {
      url: "https://example.com/e50",
      archivedAt: ARCHIVE_CAPACITY + 1,
    })

    const added = addArchiveEntry(full, replacing)

    expect(added).toHaveLength(ARCHIVE_CAPACITY)
    expect(added.at(-1)?.id).toBe(`e${ARCHIVE_CAPACITY - 1}`)
  })
})

describe("removeArchiveEntry", () => {
  it("指定したエントリだけが消え、残りの順序は保たれる", () => {
    const archive = [entry("a"), entry("b"), entry("c")]

    const removed = removeArchiveEntry(archive, ArchiveEntryId.make("b"))

    expect(idsOf(removed)).toStrictEqual(["a", "c"])
  })

  it("存在しないエントリを指定しても一覧は変わらない", () => {
    const archive = [entry("a")]

    const removed = removeArchiveEntry(archive, ArchiveEntryId.make("missing"))

    expect(removed).toStrictEqual(archive)
  })
})

describe("archiveEntriesInSpace", () => {
  it("指定した Space のエントリだけが、元の順序のまま残る", () => {
    const work = SpaceId.make("work")
    const home = SpaceId.make("home")
    const archive = [
      entry("w2", { spaceId: work }),
      entry("h1", { spaceId: home }),
      entry("w1", { spaceId: work }),
    ]

    expect(idsOf(archiveEntriesInSpace(archive, work))).toStrictEqual(["w2", "w1"])
  })

  it("その Space のエントリが無ければ空になる", () => {
    const archive = [entry("a", { spaceId: SpaceId.make("work") })]

    expect(archiveEntriesInSpace(archive, SpaceId.make("home"))).toStrictEqual([])
  })
})
