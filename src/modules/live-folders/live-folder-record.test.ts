import { Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  isRefreshDue,
  isUnseen,
  markAllSeen,
  markItemSeen,
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

describe("未読の判定", () => {
  it("一度も見ていない項目は未読", () => {
    expect(isUnseen(record([item("a")]), item("a"))).toBe(true)
  })

  it("見た後に更新されていない項目は既読", () => {
    expect(isUnseen(record([item("a", 100)], { a: 100 }), item("a", 100))).toBe(false)
  })

  it("見た後に更新された項目は未読に戻る", () => {
    expect(isUnseen(record([item("a", 200)], { a: 100 }), item("a", 200))).toBe(true)
  })
})

describe("既読にする", () => {
  it("開いた項目は、その時点の更新時刻まで見たことになる", () => {
    const marked = markItemSeen(record([item("a", 100), item("b", 200)]), "b")

    expect(marked.items.map((i) => isUnseen(marked, i))).toStrictEqual([true, false])
  })

  it("無い項目を既読にしても何も変わらない", () => {
    const original = record([item("a")])

    expect(markItemSeen(original, "missing")).toStrictEqual(original)
  })

  it("まとめて既読にすると、今ある項目がすべて既読になる", () => {
    const marked = markAllSeen(record([item("a", 100), item("b", 200)], { a: 50 }))

    expect(marked.items.map((i) => isUnseen(marked, i))).toStrictEqual([false, false])
  })
})

describe("取得できたとき", () => {
  it("項目を取得した項目で置き換え、取得した時刻を残す", () => {
    const next = recordFetched(Option.some(record([item("old")])), [item("new")], 500)

    expect([next.items, next.lastAttempt]).toStrictEqual([
      [item("new")],
      { _tag: "Fetched", at: 500 },
    ])
  })

  it("残った項目の既読は保ち、消えた項目の既読の記録は捨てる", () => {
    const previous = record([item("a"), item("b")], { a: 100, b: 100 })

    const next = recordFetched(Option.some(previous), [item("a")], 500)

    expect(next.seenVersions).toStrictEqual({ a: 100 })
  })

  it("初めての取得では、すべての項目が未読になる", () => {
    const next = recordFetched(Option.none(), [item("a"), item("b")], 500)

    expect(next.items.map((i) => isUnseen(next, i))).toStrictEqual([true, true])
  })
})

describe("取得できなかったとき", () => {
  it("前回の項目と既読を残したまま、失敗の理由と時刻を残す", () => {
    const previous = record([item("a")], { a: 100 })

    const next = recordFailed(Option.some(previous), { _tag: "Unreachable" }, 500)

    expect(next).toStrictEqual({
      items: [item("a")],
      lastAttempt: { _tag: "Failed", at: 500, failure: { _tag: "Unreachable" } },
      seenVersions: { a: 100 },
    })
  })

  it("一度も取得できていなければ、項目は空", () => {
    const next = recordFailed(Option.none(), { _tag: "PermissionMissing" }, 500)

    expect(next.items).toStrictEqual([])
  })
})

describe("自動で取得し直す頃合い", () => {
  const fetchedAt = (at: number) => Option.some(recordFetched(Option.none(), [], at))

  it("一度も取得していなければ取得する", () => {
    expect(isRefreshDue(Option.none(), 0, MINUTE)).toBe(true)
  })

  it("前回の取得から間隔が空いていなければ取得しない", () => {
    expect(isRefreshDue(fetchedAt(0), MINUTE - 1, MINUTE)).toBe(false)
  })

  it("前回の取得から間隔が空いていれば取得する", () => {
    expect(isRefreshDue(fetchedAt(0), MINUTE, MINUTE)).toBe(true)
  })

  it("失敗した後も、間隔が空けば取得し直す", () => {
    const failed = recordFailed(Option.none(), { _tag: "Unreachable" }, 0)

    expect(isRefreshDue(Option.some(failed), MINUTE, MINUTE)).toBe(true)
  })

  it("利用上限に達していれば、再開時刻までは間隔が空いても取得しない", () => {
    const limited = recordFailed(Option.none(), { _tag: "RateLimited", retryAt: 10 * MINUTE }, 0)

    expect([
      isRefreshDue(Option.some(limited), 10 * MINUTE - 1, MINUTE),
      isRefreshDue(Option.some(limited), 10 * MINUTE, MINUTE),
    ]).toStrictEqual([false, true])
  })
})
