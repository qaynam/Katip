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

describe("snapshots", () => {
  it("record the tabs that belong to a Space with their URLs, in the order given", () => {
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

  it("leave out tabs that belong to no Space and tabs without a URL", () => {
    const workspace = assignTab(emptyWorkspace, tabId(1), spaceId("home"), 0)

    const snapshot = takeSnapshot(workspace, [
      { tabId: tabId(1), url: "" },
      { tabId: tabId(2), url: "https://untracked.example/" },
    ])

    expect(snapshot).toStrictEqual([])
  })
})

describe("claiming restore records", () => {
  it("claims the record whose URL matches exactly", () => {
    const queue = startRestore([record("https://a.example/"), record("https://b.example/")], 0)

    const claimed = claimRestoreRecord(queue, "https://b.example/", 1, always)

    expect(
      Option.map(claimed, ([found, rest]) => [found.url, rest.records.map((r) => r.url)]),
    ).toStrictEqual(Option.some(["https://b.example/", ["https://a.example/"]]))
  })

  it("claims records sharing a URL one at a time, in recorded order", () => {
    const first = record("https://same.example/", { spaceId: spaceId("home") })
    const second = record("https://same.example/", { spaceId: spaceId("work") })
    const queue = startRestore([first, second], 0)

    const claimed = claimRestoreRecord(queue, "https://same.example/", 1, always)

    expect(Option.map(claimed, ([found, rest]) => [found, rest.records])).toStrictEqual(
      Option.some([first, [second]]),
    )
  })

  it("doesn't match a URL that differs only in its query", () => {
    const queue = startRestore([record("https://a.example/?x=1")], 0)

    const claimed = claimRestoreRecord(queue, "https://a.example/?x=2", 1, always)

    expect(claimed).toStrictEqual(Option.none())
  })

  it("doesn't match once the restore window has passed", () => {
    const queue = startRestore([record("https://a.example/")], 0)

    const claimed = claimRestoreRecord(queue, "https://a.example/", RESTORE_WINDOW_MS + 1, always)

    expect(claimed).toStrictEqual(Option.none())
  })

  it("doesn't match a record whose Space was deleted", () => {
    const queue = startRestore([record("https://a.example/", { spaceId: spaceId("gone") })], 0)

    const claimed = claimRestoreRecord(queue, "https://a.example/", 1, (id) => id !== "gone")

    expect(claimed).toStrictEqual(Option.none())
  })
})

describe("restoring a tab", () => {
  it("gives the new tab ID the record's Space, pin binding and tab name", () => {
    const pinned = { bookmarkId: BookmarkId.make("b1"), pinnedUrl: "https://a.example/" }

    const workspace = restoreTab(
      emptyWorkspace,
      tabId(7),
      record("https://a.example/next", { pinned, titleOverride: "Mail" }),
      500,
    )

    expect(trackedTab(workspace, tabId(7))).toStrictEqual(
      Option.some({
        tabId: tabId(7),
        spaceId: spaceId("work"),
        pinned,
        titleOverride: "Mail",
        lastActiveAt: 500,
      }),
    )
  })

  it("brings back the pin and tab name the snapshot recorded", () => {
    const pinned = { bookmarkId: BookmarkId.make("b1"), pinnedUrl: "https://a.example/" }
    const before = setTitleOverride(
      bindPinned(assignTab(emptyWorkspace, tabId(1), spaceId("work"), 0), tabId(1), pinned),
      tabId(1),
      Option.some("Mail"),
    )

    const saved = Option.getOrThrow(
      Array.head(takeSnapshot(before, [{ tabId: tabId(1), url: "https://a.example/next" }])),
    )
    const after = restoreTab(emptyWorkspace, tabId(9), saved, 0)

    expect(
      Option.map(trackedTab(after, tabId(9)), (t) => [t.pinned, t.titleOverride]),
    ).toStrictEqual(Option.some([pinned, "Mail"]))
  })
})
