import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { themeOf } from "#modules/theme"
import { BookmarkId, TabId } from "#platform/browser"
import type { SidebarView } from "#protocol"
import { respondInFixture } from "./fixture-backend"
import { fixtureView } from "./fixture-view"

const view = fixtureView(0)

const viewAfter = (command: Parameters<typeof respondInFixture>[0], from: SidebarView = view) => {
  const { view: next } = respondInFixture(command, from)
  if (next === undefined) throw new Error("ビューが返らなかった")
  return next
}

const activeSpace = (next: SidebarView) => next.spaces.find((s) => s.id === next.activeSpaceId)

const temporaryTabIds = (next: SidebarView) =>
  (activeSpace(next)?.temporaryEntries ?? []).flatMap((entry) =>
    entry._tag === "TemporaryTab" ? [entry.tab.tabId] : entry.tabs.map((tab) => tab.tabId),
  )

const temporaryShape = (next: SidebarView) =>
  (activeSpace(next)?.temporaryEntries ?? []).map((entry) =>
    entry._tag === "TemporaryTab" ? entry.tab.tabId : entry.tabs.map((tab) => tab.tabId),
  )

const rootFolder = (next: SidebarView, bookmarkId: string) => {
  const pinned = next.spaces[0]?.pinned
  if (pinned?._tag !== "Available") throw new Error("ピン留めが読めない")
  return pinned.nodes
    .flatMap((node) => (node._tag === "PinnedFolder" ? [node] : []))
    .find((folder) => folder.bookmarkId === bookmarkId)
}

describe("フィクスチャの素朴な応答", () => {
  it("Space を切り替えられる", () => {
    const next = viewAfter({
      _tag: "SwitchSpace",
      windowId: view.windowId,
      spaceId: SpaceId.make("hobby"),
    })

    expect(next.activeSpaceId).toBe("hobby")
  })

  it("一時タブを閉じると一覧から消える", () => {
    const next = viewAfter({ _tag: "CloseTab", tabId: TabId.make(32) })

    expect(temporaryTabIds(next)).not.toContain(32)
  })

  it("一時タブどうしを分割ビューにすると、落とした先の行の右に並ぶ", () => {
    const next = viewAfter({ _tag: "SplitTabs", tabId: TabId.make(33), withTabId: TabId.make(32) })

    expect(temporaryShape(next)).toContainEqual([32, 33])
    expect(temporaryShape(next)).not.toContain(33)
  })

  it("分割ビューを解除すると、2 つの一時タブに戻る", () => {
    const split = activeSpace(view)?.temporaryEntries.find(
      (entry) => entry._tag === "TemporarySplit",
    )
    if (split?._tag !== "TemporarySplit") throw new Error("フィクスチャに分割ビューが無い")

    const next = viewAfter({ _tag: "Unsplit", splitViewId: split.splitViewId })

    expect(temporaryShape(next)).toStrictEqual(
      expect.arrayContaining(split.tabs.map((tab) => tab.tabId)),
    )
  })

  it("分割ビューの片方を閉じると、残ったタブは 1 つの一時タブになる", () => {
    const split = activeSpace(view)?.temporaryEntries.find(
      (entry) => entry._tag === "TemporarySplit",
    )
    if (split?._tag !== "TemporarySplit") throw new Error("フィクスチャに分割ビューが無い")

    const next = viewAfter({ _tag: "CloseTab", tabId: split.tabs[0].tabId })

    expect(temporaryShape(next)).toContain(split.tabs[1].tabId)
  })

  it("フォルダを開閉できる", () => {
    const next = viewAfter({
      _tag: "SetFolderExpanded",
      bookmarkId: BookmarkId.make("design-docs"),
      isExpanded: false,
    })

    expect(rootFolder(next, "design-docs")?.isExpanded).toBe(false)
  })

  it("ピン留めを別のフォルダの指定した位置へ動かせる", () => {
    const next = viewAfter({
      _tag: "MovePinnedItem",
      bookmarkId: BookmarkId.make("calendar"),
      placement: {
        spaceId: SpaceId.make("work"),
        parentId: BookmarkId.make("design-docs"),
        index: 0,
      },
    })

    expect(rootFolder(next, "design-docs")?.children[0]?.bookmarkId).toBe("calendar")
  })

  it("別の Space のタブをアクティブにすると、その Space に切り替わる", () => {
    const next = viewAfter({ _tag: "ActivateTab", tabId: TabId.make(41) })

    expect(next.activeSpaceId).toBe("hobby")
  })

  it("作ったフォルダの ID を結果として返す", () => {
    const response = respondInFixture(
      { _tag: "CreateFolder", spaceId: SpaceId.make("work"), parentId: null },
      view,
    )

    expect(response.outcome._tag === "Succeeded" && response.outcome.createdBookmarkId).toBeTruthy()
  })

  it("Space のテーマを変えると、その Space のテーマだけが変わる", () => {
    const theme = { ...themeOf([{ hue: 350, chroma: 0.55 }]), mode: "light" as const }

    const next = viewAfter({ _tag: "SetSpaceTheme", spaceId: SpaceId.make("hobby"), theme })

    expect(next.spaces.find((space) => space.id === "hobby")?.theme).toStrictEqual(theme)
    expect(next.spaces.find((space) => space.id === "work")?.theme).toStrictEqual(
      view.spaces.find((space) => space.id === "work")?.theme,
    )
  })

  it("作成した Space は指定したテーマを持ち、表示中の Space になる", () => {
    const theme = themeOf([{ hue: 150, chroma: 0.75 }])

    const next = viewAfter({ _tag: "CreateSpace", windowId: view.windowId, theme })

    expect(activeSpace(next)?.theme).toStrictEqual(theme)
    expect(next.spaces).toHaveLength(view.spaces.length + 1)
  })

  it("再現していないコマンドは、そのことを通知する", () => {
    const response = respondInFixture({ _tag: "ArchiveTab", tabId: TabId.make(31) }, view)

    expect(response.notice).toContain("ArchiveTab")
  })
})
