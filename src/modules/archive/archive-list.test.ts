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
  it("puts the added entry first", () => {
    const archive = [entry("older", { archivedAt: 100 })]

    const added = addArchiveEntry(archive, entry("newer", { archivedAt: 200 }))

    expect(idsOf(added)).toStrictEqual(["newer", "older"])
  })

  it("keeps the most recently archived first even when the added entry is older than existing ones", () => {
    const archive = [entry("b", { archivedAt: 300 }), entry("a", { archivedAt: 100 })]

    const added = addArchiveEntry(archive, entry("middle", { archivedAt: 200 }))

    expect(idsOf(added)).toStrictEqual(["b", "middle", "a"])
  })

  it("replaces an entry with the same URL, keeping only the new details", () => {
    const url = "https://example.com/same"
    const archive = [entry("old", { url, title: "Old", archivedAt: 100 })]
    const newer = entry("new", {
      url,
      title: "New",
      spaceId: SpaceId.make("home"),
      archivedAt: 200,
    })

    const added = addArchiveEntry(archive, newer)

    expect(added).toStrictEqual([newer])
  })

  it("keeps entries with different URLs apart even with the same title", () => {
    const archive = [entry("a", { title: "Same title", archivedAt: 100 })]

    const added = addArchiveEntry(archive, entry("b", { title: "Same title", archivedAt: 200 }))

    expect(idsOf(added)).toStrictEqual(["b", "a"])
  })

  it.each(["", "   "])("makes the URL the title when the title is blank (%j)", (title) => {
    const added = addArchiveEntry([], entry("a", { url: "https://example.com/x", title }))

    expect(added[0]?.title).toBe("https://example.com/x")
  })

  it(`drops the oldest entries beyond ${ARCHIVE_CAPACITY}`, () => {
    const full = Array.makeBy(ARCHIVE_CAPACITY, (i) =>
      entry(`e${i}`, { archivedAt: ARCHIVE_CAPACITY - i }),
    )

    const added = addArchiveEntry(full, entry("newest", { archivedAt: ARCHIVE_CAPACITY + 1 }))

    expect(added).toHaveLength(ARCHIVE_CAPACITY)
    expect(added[0]?.id).toBe("newest")
    expect(added.some((e) => e.id === `e${ARCHIVE_CAPACITY - 1}`)).toBe(false)
  })

  it(`drops no other entry when replacing one with the same URL at exactly ${ARCHIVE_CAPACITY}`, () => {
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
  it("removes only the given entry and keeps the rest in order", () => {
    const archive = [entry("a"), entry("b"), entry("c")]

    const removed = removeArchiveEntry(archive, ArchiveEntryId.make("b"))

    expect(idsOf(removed)).toStrictEqual(["a", "c"])
  })

  it("leaves the list as it is for an entry that doesn't exist", () => {
    const archive = [entry("a")]

    const removed = removeArchiveEntry(archive, ArchiveEntryId.make("missing"))

    expect(removed).toStrictEqual(archive)
  })
})

describe("archiveEntriesInSpace", () => {
  it("keeps only the given Space's entries, in their order", () => {
    const work = SpaceId.make("work")
    const home = SpaceId.make("home")
    const archive = [
      entry("w2", { spaceId: work }),
      entry("h1", { spaceId: home }),
      entry("w1", { spaceId: work }),
    ]

    expect(idsOf(archiveEntriesInSpace(archive, work))).toStrictEqual(["w2", "w1"])
  })

  it("is empty when the Space has no entries", () => {
    const archive = [entry("a", { spaceId: SpaceId.make("work") })]

    expect(archiveEntriesInSpace(archive, SpaceId.make("home"))).toStrictEqual([])
  })
})
