import { Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  isRefreshDue,
  isUnseen,
  markAllSeen,
  markItemSeen,
  newlyArrived,
  recordFailed,
  recordFetched,
  type LiveFolderRecord,
} from "./live-folder-record"
import type { LiveItem } from "./live-source"

const MINUTE = 60_000

const item = (id: string, updatedAt = 100): LiveItem => ({
  id,
  title: id,
  subtitle: "",
  url: `https://example.com/${id}`,
  updatedAt,
})

const record = (
  items: ReadonlyArray<LiveItem>,
  seenVersions: Record<string, number> = {},
): LiveFolderRecord => ({ items, lastAttempt: { _tag: "Fetched", at: 0 }, seenVersions })

describe("unread", () => {
  it("an item never seen is unread", () => {
    expect(isUnseen(record([item("a")]), item("a"))).toBe(true)
  })

  it("an item not updated since it was seen is read", () => {
    expect(isUnseen(record([item("a", 100)], { a: 100 }), item("a", 100))).toBe(false)
  })

  it("an item updated after it was seen becomes unread again", () => {
    expect(isUnseen(record([item("a", 200)], { a: 100 }), item("a", 200))).toBe(true)
  })
})

describe("marking as seen", () => {
  it("an opened item counts as seen up to its update time at that moment", () => {
    const marked = markItemSeen(record([item("a", 100), item("b", 200)]), "b")

    expect(marked.items.map((i) => isUnseen(marked, i))).toStrictEqual([true, false])
  })

  it("marking a missing item as seen changes nothing", () => {
    const original = record([item("a")])

    expect(markItemSeen(original, "missing")).toStrictEqual(original)
  })

  it("marking all as seen makes every current item read", () => {
    const marked = markAllSeen(record([item("a", 100), item("b", 200)], { a: 50 }))

    expect(marked.items.map((i) => isUnseen(marked, i))).toStrictEqual([false, false])
  })
})

describe("after a successful fetch", () => {
  it("replaces the items with the fetched ones and keeps the fetch time", () => {
    const next = recordFetched(Option.some(record([item("old")])), [item("new")], 500)

    expect([next.items, next.lastAttempt]).toStrictEqual([
      [item("new")],
      { _tag: "Fetched", at: 500 },
    ])
  })

  it("keeps what was seen of remaining items and drops it for items that are gone", () => {
    const previous = record([item("a"), item("b")], { a: 100, b: 100 })

    const next = recordFetched(Option.some(previous), [item("a")], 500)

    expect(next.seenVersions).toStrictEqual({ a: 100 })
  })

  it("on the first fetch, every item is unread", () => {
    const next = recordFetched(Option.none(), [item("a"), item("b")], 500)

    expect(next.items.map((i) => isUnseen(next, i))).toStrictEqual([true, true])
  })
})

describe("after a failed fetch", () => {
  it("keeps the previous items and what was seen, adding the failure's reason and time", () => {
    const previous = record([item("a")], { a: 100 })

    const next = recordFailed(Option.some(previous), { _tag: "Unreachable" }, 500)

    expect(next).toStrictEqual({
      items: [item("a")],
      lastAttempt: { _tag: "Failed", at: 500, failure: { _tag: "Unreachable" } },
      seenVersions: { a: 100 },
    })
  })

  it("has no items when nothing was ever fetched", () => {
    const next = recordFailed(Option.none(), { _tag: "PermissionMissing" }, 500)

    expect(next.items).toStrictEqual([])
  })
})

describe("items arriving with a fetch", () => {
  const ids = (items: ReadonlyArray<LiveItem>) => items.map((each) => each.id)
  const unreachable = { _tag: "Unreachable" } as const

  it("are the fetched items the previous fetch didn't have, in the fetched order", () => {
    const previous = recordFetched(Option.none(), [item("b"), item("a")], 0)

    const arrived = newlyArrived(Option.some(previous), [item("d"), item("c"), item("b")])

    expect(ids(arrived)).toStrictEqual(["d", "c"])
  })

  it("are none on a folder's first fetch, so a new folder doesn't announce everything in it", () => {
    expect(newlyArrived(Option.none(), [item("a")])).toStrictEqual([])
  })

  it("are none on the first successful fetch after only failed ones", () => {
    const failed = recordFailed(Option.none(), unreachable, 0)

    expect(newlyArrived(Option.some(failed), [item("a")])).toStrictEqual([])
  })

  it("leave out the items a failed fetch kept from the successful one before it", () => {
    const failed = recordFailed(
      Option.some(recordFetched(Option.none(), [item("a")], 0)),
      unreachable,
      10,
    )

    expect(ids(newlyArrived(Option.some(failed), [item("b"), item("a")]))).toStrictEqual(["b"])
  })

  it("are every item after a fetch that found nothing, even with a failed fetch in between", () => {
    const failed = recordFailed(Option.some(recordFetched(Option.none(), [], 0)), unreachable, 10)

    expect(ids(newlyArrived(Option.some(failed), [item("a")]))).toStrictEqual(["a"])
  })
})

describe("when to refetch automatically", () => {
  const fetchedAt = (at: number) => Option.some(recordFetched(Option.none(), [], at))

  it("fetches when nothing was ever fetched", () => {
    expect(isRefreshDue(Option.none(), 0, MINUTE)).toBe(true)
  })

  it("doesn't fetch before the interval since the last fetch has passed", () => {
    expect(isRefreshDue(fetchedAt(0), MINUTE - 1, MINUTE)).toBe(false)
  })

  it("fetches once the interval since the last fetch has passed", () => {
    expect(isRefreshDue(fetchedAt(0), MINUTE, MINUTE)).toBe(true)
  })

  it("refetches after a failure too, once the interval has passed", () => {
    const failed = recordFailed(Option.none(), { _tag: "Unreachable" }, 0)

    expect(isRefreshDue(Option.some(failed), MINUTE, MINUTE)).toBe(true)
  })

  it("after hitting the rate limit, doesn't fetch before the retry time even when the interval has passed", () => {
    const limited = recordFailed(Option.none(), { _tag: "RateLimited", retryAt: 10 * MINUTE }, 0)

    expect([
      isRefreshDue(Option.some(limited), 10 * MINUTE - 1, MINUTE),
      isRefreshDue(Option.some(limited), 10 * MINUTE, MINUTE),
    ]).toStrictEqual([false, true])
  })
})
