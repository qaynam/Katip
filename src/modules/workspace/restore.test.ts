import { Array, Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { BookmarkId, TabId } from "#platform/browser"
import {
  claimRestoreRecord,
  RESTORE_WINDOW_MS,
  restoreTab,
  startRestore,
  takeSnapshot,
  type RestoreRecord,
} from "./restore"
import { assignTab, bindPinned, emptyWorkspace, setTitleOverride, trackedTab } from "./workspace"

const tabId = (value: number) => TabId.make(value)
const spaceId = (value: string) => SpaceId.make(value)
const always = () => true

const record = (url: string, overrides: Partial<RestoreRecord> = {}): RestoreRecord => ({
  url,
  spaceId: spaceId("work"),
  pinned: null,
  titleOverride: null,
  ...overrides,
})

describe("スナップショット", () => {
  it("所属しているタブを、渡された並び順のまま URL つきで記録する", () => {
    const workspace = assignTab(
      assignTab(emptyWorkspace, tabId(1), spaceId("home"), 0),
      tabId(2),
      spaceId("work"),
      0,
    )

    const snapshot = takeSnapshot(workspace, [
      { tabId: tabId(2), url: "https://b.example/" },
      { tabId: tabId(1), url: "https://a.example/" },
    ])

    expect(snapshot.map((r) => [r.url, r.spaceId])).toStrictEqual([
      ["https://b.example/", "work"],
      ["https://a.example/", "home"],
    ])
  })

  it("どの Space にも属さないタブと URL の無いタブは記録しない", () => {
    const workspace = assignTab(emptyWorkspace, tabId(1), spaceId("home"), 0)

    const snapshot = takeSnapshot(workspace, [
      { tabId: tabId(1), url: "" },
      { tabId: tabId(2), url: "https://untracked.example/" },
    ])

    expect(snapshot).toStrictEqual([])
  })
})

describe("復元レコードの照合", () => {
  it("URL が完全に一致するレコードを消費する", () => {
    const queue = startRestore([record("https://a.example/"), record("https://b.example/")], 0)

    const claimed = claimRestoreRecord(queue, "https://b.example/", 1, always)

    expect(
      Option.map(claimed, ([found, rest]) => [found.url, rest.records.map((r) => r.url)]),
    ).toStrictEqual(Option.some(["https://b.example/", ["https://a.example/"]]))
  })

  it("同じ URL のレコードが複数あるときは記録順に 1 件ずつ消費する", () => {
    const first = record("https://same.example/", { spaceId: spaceId("home") })
    const second = record("https://same.example/", { spaceId: spaceId("work") })
    const queue = startRestore([first, second], 0)

    const claimed = claimRestoreRecord(queue, "https://same.example/", 1, always)

    expect(Option.map(claimed, ([found, rest]) => [found, rest.records])).toStrictEqual(
      Option.some([first, [second]]),
    )
  })

  it("クエリだけが違う URL には一致しない", () => {
    const queue = startRestore([record("https://a.example/?x=1")], 0)

    const claimed = claimRestoreRecord(queue, "https://a.example/?x=2", 1, always)

    expect(claimed).toStrictEqual(Option.none())
  })

  it("復元期間を過ぎたレコードには一致しない", () => {
    const queue = startRestore([record("https://a.example/")], 0)

    const claimed = claimRestoreRecord(queue, "https://a.example/", RESTORE_WINDOW_MS + 1, always)

    expect(claimed).toStrictEqual(Option.none())
  })

  it("Space が削除されたレコードには一致しない", () => {
    const queue = startRestore([record("https://a.example/", { spaceId: spaceId("gone") })], 0)

    const claimed = claimRestoreRecord(queue, "https://a.example/", 1, (id) => id !== "gone")

    expect(claimed).toStrictEqual(Option.none())
  })
})

describe("タブの復元", () => {
  it("レコードの Space・ピンのバインディング・タブ名を新しいタブ ID が引き継ぐ", () => {
    const pinned = { bookmarkId: BookmarkId.make("b1"), pinnedUrl: "https://a.example/" }

    const workspace = restoreTab(
      emptyWorkspace,
      tabId(7),
      record("https://a.example/next", { pinned, titleOverride: "メール" }),
      500,
    )

    expect(trackedTab(workspace, tabId(7))).toStrictEqual(
      Option.some({
        tabId: tabId(7),
        spaceId: spaceId("work"),
        pinned,
        titleOverride: "メール",
        lastActiveAt: 500,
      }),
    )
  })

  it("記録時のピンとタブ名はスナップショットに含まれ、復元で元に戻る", () => {
    const pinned = { bookmarkId: BookmarkId.make("b1"), pinnedUrl: "https://a.example/" }
    const before = setTitleOverride(
      bindPinned(assignTab(emptyWorkspace, tabId(1), spaceId("work"), 0), tabId(1), pinned),
      tabId(1),
      Option.some("メール"),
    )

    const saved = Option.getOrThrow(
      Array.head(takeSnapshot(before, [{ tabId: tabId(1), url: "https://a.example/next" }])),
    )
    const after = restoreTab(emptyWorkspace, tabId(9), saved, 0)

    expect(
      Option.map(trackedTab(after, tabId(9)), (t) => [t.pinned, t.titleOverride]),
    ).toStrictEqual(Option.some([pinned, "メール"]))
  })
})
