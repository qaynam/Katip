import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
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

    expect(activeSpace(next)?.temporaryTabs.map((tab) => tab.tabId)).not.toContain(32)
  })

  it("フォルダを開閉できる", () => {
    const next = viewAfter({
      _tag: "SetFolderExpanded",
      bookmarkId: BookmarkId.make("design-docs"),
      isExpanded: false,
    })

    expect(rootFolder(next, "design-docs")?.isExpanded).toBe(false)
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

  it("再現していないコマンドは、そのことを通知する", () => {
    const response = respondInFixture({ _tag: "ArchiveTab", tabId: TabId.make(31) }, view)

    expect(response.notice).toContain("ArchiveTab")
  })
})
