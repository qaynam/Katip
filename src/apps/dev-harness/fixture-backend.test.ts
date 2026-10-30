import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { themeOf } from "#modules/theme"
import { BookmarkId, TabId } from "#platform/browser"
import type { PinnedLiveFolderView, PinnedNodeView, SidebarView } from "#protocol"
import { respondInFixture } from "./fixture-backend"
import { fixtureView } from "./fixture-view"

const NOW = 0
const view = fixtureView(NOW)

const viewAfter = (command: Parameters<typeof respondInFixture>[0], from: SidebarView = view) => {
  const { view: next } = respondInFixture(command, from, NOW)
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

const liveFoldersIn = (nodes: ReadonlyArray<PinnedNodeView>): ReadonlyArray<PinnedLiveFolderView> =>
  nodes.flatMap((node) =>
    node._tag === "PinnedLiveFolder"
      ? [node]
      : node._tag === "PinnedFolder"
        ? liveFoldersIn(node.children)
        : [],
  )

const liveFolder = (next: SidebarView, bookmarkId: string) => {
  const found = next.spaces
    .flatMap((space) =>
      space.pinned._tag === "Available" ? liveFoldersIn(space.pinned.nodes) : [],
    )
    .find((folder) => folder.bookmarkId === bookmarkId)
  if (found === undefined) throw new Error(`ライブフォルダ ${bookmarkId} が無い`)
  return found
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
      NOW,
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

  it("フォルダを削除すると、ピン留めから消える", () => {
    const next = viewAfter({ _tag: "DeleteFolder", bookmarkId: BookmarkId.make("design-docs") })

    expect(rootFolder(next, "design-docs")).toBeUndefined()
  })

  it("作ったライブフォルダは取得元の項目を並べた状態で現れ、その ID を結果として返す", () => {
    const response = respondInFixture(
      {
        _tag: "CreateLiveFolder",
        spaceId: SpaceId.make("work"),
        parentId: null,
        source: { _tag: "GitHub", query: "assigned-issues" },
      },
      view,
      NOW,
    )
    if (response.outcome._tag !== "Succeeded" || response.outcome.createdBookmarkId === null) {
      throw new Error("ライブフォルダの ID が返らなかった")
    }
    if (response.view === undefined) throw new Error("ビューが返らなかった")

    const created = liveFolder(response.view, response.outcome.createdBookmarkId)
    expect(created.status._tag).toBe("Ready")
    expect(created.items.length).toBeGreaterThan(0)
  })

  it("ライブフォルダも開閉できる", () => {
    const next = viewAfter({
      _tag: "SetFolderExpanded",
      bookmarkId: BookmarkId.make("live-inbox"),
      isExpanded: false,
    })

    expect(liveFolder(next, "live-inbox").isExpanded).toBe(false)
  })

  it("ライブフォルダの名前を変えられる", () => {
    const next = viewAfter({
      _tag: "RenamePinnedItem",
      bookmarkId: BookmarkId.make("live-inbox"),
      title: "メール",
    })

    expect(liveFolder(next, "live-inbox").title).toBe("メール")
  })

  it("取得に失敗したライブフォルダを取得し直すと、取得済みになる", () => {
    const next = viewAfter({
      _tag: "RefreshLiveFolder",
      bookmarkId: BookmarkId.make("live-my-prs"),
    })

    expect(liveFolder(next, "live-my-prs").status).toStrictEqual({
      _tag: "Ready",
      refreshedAt: NOW,
    })
  })

  it("すべて既読にすると、未読の項目が無くなる", () => {
    const next = viewAfter({
      _tag: "MarkLiveFolderSeen",
      bookmarkId: BookmarkId.make("live-inbox"),
    })

    expect(liveFolder(next, "live-inbox").items.some((item) => item.isUnseen)).toBe(false)
  })

  it("ライブフォルダの項目を開くと一時タブとして開き、その項目は既読になる", () => {
    const [first] = liveFolder(view, "live-inbox").items
    if (first === undefined) throw new Error("フィクスチャの受信トレイが空")

    const next = viewAfter({
      _tag: "OpenLiveItem",
      windowId: view.windowId,
      bookmarkId: BookmarkId.make("live-inbox"),
      itemId: first.id,
    })

    expect(activeSpace(next)?.temporaryEntries[0]).toMatchObject({
      tab: { url: first.url, isActive: true },
    })
    expect(liveFolder(next, "live-inbox").items[0]?.isUnseen).toBe(false)
  })

  it("ライブフォルダの並べ方を変えると、その並べ方で項目が並び直る", () => {
    const next = viewAfter({
      _tag: "SetLiveFolderSort",
      bookmarkId: BookmarkId.make("live-inbox"),
      sort: "oldest",
    })

    const folder = liveFolder(next, "live-inbox")
    const updatedAts = folder.items.map((item) => item.updatedAt)
    expect(folder.sort).toBe("oldest")
    expect(updatedAts).toStrictEqual([...updatedAts].sort((a, b) => a - b))
  })

  it("リポジトリ順では、同じリポジトリの項目をまとめて新しい順に並べる", () => {
    const next = viewAfter({
      _tag: "SetLiveFolderSort",
      bookmarkId: BookmarkId.make("live-reviews"),
      sort: "source",
    })

    expect(liveFolder(next, "live-reviews").items.map((item) => item.subtitle)).toStrictEqual([
      "katip/katip #214",
      "katip/katip #209",
      "katip/website #77",
    ])
  })

  it("URL を開くと、表示中の Space の一時タブとして開く", () => {
    const next = viewAfter({
      _tag: "OpenUrl",
      windowId: view.windowId,
      url: "https://github.com/login",
    })

    expect(activeSpace(next)?.temporaryEntries[0]).toMatchObject({
      tab: { url: "https://github.com/login", isActive: true },
    })
  })

  it("再現していないコマンドは、そのことを通知する", () => {
    const response = respondInFixture({ _tag: "ArchiveTab", tabId: TabId.make(31) }, view, NOW)

    expect(response.notice).toContain("ArchiveTab")
  })
})
