import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { ArchiveEntryId } from "#modules/archive"
import { SpaceId } from "#modules/space"
import { archiveEntry, openPinnedTab, pinnedItem, tabView } from "../testing/view-builders"
import { archiveEntriesFor, hostOf, pinnedItemDisplay } from "./view-queries"

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
