import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { ArchiveEntryId } from "#modules/archive"
import { SpaceId } from "#modules/space"
import { SplitViewId } from "#platform/browser"
import {
  archiveEntry,
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  pinnedSplit,
  tabView,
} from "../testing/view-builders"
import {
  archiveEntriesFor,
  hostOf,
  openSplitViewOf,
  pinnedItemDisplay,
  selfAndDescendantFolderIds,
} from "./view-queries"

describe("archiveEntriesFor", () => {
  const work = SpaceId.make("work")
  const hobby = SpaceId.make("hobby")
  const entries = [
    archiveEntry("old", { spaceId: work, archivedAt: 100 }),
    archiveEntry("hobby", { spaceId: hobby, archivedAt: 300 }),
    archiveEntry("new", { spaceId: work, archivedAt: 200 }),
  ]

  it("現在の Space のアーカイブだけを新しい順に並べる", () => {
    const ids = archiveEntriesFor(entries, "currentSpace", work).map((entry) => entry.id)

    expect(ids).toStrictEqual([ArchiveEntryId.make("new"), ArchiveEntryId.make("old")])
  })

  it("すべての Space を選ぶと、他の Space のアーカイブも新しい順に混ぜて並べる", () => {
    const ids = archiveEntriesFor(entries, "allSpaces", work).map((entry) => entry.id)

    expect(ids).toStrictEqual(["hobby", "new", "old"].map((id) => ArchiveEntryId.make(id)))
  })
})

describe("pinnedItemDisplay", () => {
  it("閉じたピンはピンの名前で表示する", () => {
    const item = pinnedItem("a", { title: "設計書", openTab: null })

    expect(pinnedItemDisplay(item)).toStrictEqual({ _tag: "Closed", title: "設計書" })
  })

  it("名前の無い閉じたピンは URL のホスト名で表示する", () => {
    const item = pinnedItem("a", { title: "", url: "https://example.com/docs", openTab: null })

    expect(pinnedItemDisplay(item).title).toBe("example.com")
  })

  it("ピンした URL にいる間は、ページの名前ではなくピンの名前で表示する", () => {
    const tab = tabView(1, { title: "Untitled document - Docs" })
    const item = pinnedItem("a", { title: "議事録", openTab: openPinnedTab(tab) })

    expect(pinnedItemDisplay(item)).toStrictEqual({ _tag: "AtPinnedUrl", title: "議事録" })
  })

  it("別のページへ移ったら、実際のページの名前で表示する", () => {
    const tab = tabView(1, { title: "検索結果" })
    const item = pinnedItem("a", {
      title: "議事録",
      openTab: openPinnedTab(tab, { hasNavigatedAway: true }),
    })

    expect(pinnedItemDisplay(item)).toStrictEqual({ _tag: "NavigatedAway", title: "検索結果" })
  })
})

describe("hostOf", () => {
  it("URL として読めない文字列にはホスト名が無い", () => {
    expect(Option.isNone(hostOf("not a url"))).toBe(true)
  })

  it("ホストを持たない URL にはホスト名が無い", () => {
    expect(Option.isNone(hostOf("about:blank"))).toBe(true)
  })
})

describe("openSplitViewOf", () => {
  const openItem = (id: string, tabId: number, splitViewId: number | null) =>
    pinnedItem(id, {
      openTab: openPinnedTab(
        tabView(tabId, {
          splitViewId: splitViewId === null ? null : SplitViewId.make(splitViewId),
        }),
      ),
    })

  it("2 つのピンが同じ分割ビューで開いていれば、その分割ビューを返す", () => {
    const split = pinnedSplit("split", [openItem("a", 1, 9), openItem("b", 2, 9)])

    expect(openSplitViewOf(split)).toBe(SplitViewId.make(9))
  })

  it("片方でも閉じていれば、分割ビューとして開いていない", () => {
    const split = pinnedSplit("split", [openItem("a", 1, 9), pinnedItem("b")])

    expect(openSplitViewOf(split)).toBeNull()
  })

  it("両方開いていても、並べて表示していなければ分割ビューとして開いていない", () => {
    const apart = pinnedSplit("split", [openItem("a", 1, null), openItem("b", 2, null)])
    const elsewhere = pinnedSplit("split", [openItem("a", 1, 9), openItem("b", 2, 10)])

    expect(openSplitViewOf(apart)).toBeNull()
    expect(openSplitViewOf(elsewhere)).toBeNull()
  })
})

describe("selfAndDescendantFolderIds", () => {
  it("フォルダ自身と、入れ子になったフォルダやライブフォルダをすべて含む", () => {
    const folder = pinnedFolder("docs", {
      children: [
        pinnedItem("spec"),
        pinnedFolder("minutes", { children: [pinnedLiveFolder("inbox")] }),
      ],
    })

    expect(selfAndDescendantFolderIds(folder)).toStrictEqual(["docs", "minutes", "inbox"])
  })

  it("ライブフォルダは自分だけ", () => {
    expect(selfAndDescendantFolderIds(pinnedLiveFolder("inbox"))).toStrictEqual(["inbox"])
  })
})
