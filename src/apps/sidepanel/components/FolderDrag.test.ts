import { fireEvent, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BookmarkId } from "#platform/browser"
import type { PinnedNodeView, TabView } from "#protocol"
import { commandsOf, dragOverAt, renderSidebar } from "../testing/render-sidebar"
import {
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  pinnedSplit,
  sidebarView,
  spaceView,
  tabView,
} from "../testing/view-builders"

const viewWith = (
  nodes: ReadonlyArray<PinnedNodeView>,
  temporaryTabs: ReadonlyArray<TabView> = [],
) => sidebarView({ spaces: [spaceView("work", { pinnedNodes: nodes, temporaryTabs })] })

const folderHeader = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^${title}`) })

const dragOnto = async (source: HTMLElement, target: HTMLElement, verticalRatio: number) => {
  await fireEvent.dragStart(source)
  await dragOverAt(target, verticalRatio)
  await fireEvent.drop(target)
}

const docs = (overrides: Parameters<typeof pinnedFolder>[1] = {}) =>
  pinnedFolder("docs", { title: "資料", isExpanded: false, ...overrides })

const projects = pinnedFolder("projects", {
  title: "プロジェクト",
  isExpanded: false,
  children: [pinnedItem("plan"), pinnedItem("budget")],
})

describe("フォルダのドラッグ", () => {
  it("フォルダを別のフォルダの見出しの中央に落とすと、そのフォルダの中の末尾へ移す", async () => {
    const { connection } = await renderSidebar(viewWith([docs(), projects]))

    await dragOnto(folderHeader("資料"), folderHeader("プロジェクト"), 0.5)

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("docs"),
        placement: { spaceId: "work", parentId: BookmarkId.make("projects"), index: 2 },
      },
    ])
  })

  it("フォルダを別のフォルダの見出しの上端に落とすと、その前へ並べ替える", async () => {
    const { connection } = await renderSidebar(viewWith([projects, docs()]))

    await dragOnto(folderHeader("資料"), folderHeader("プロジェクト"), 0.1)

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("docs"),
        placement: { spaceId: "work", parentId: null, index: 0 },
      },
    ])
  })

  it("フォルダを自分の中にあるフォルダに落としても受け付けない", async () => {
    const minutes = pinnedFolder("minutes", { title: "議事録", isExpanded: false })
    const { connection } = await renderSidebar(
      viewWith([docs({ isExpanded: true, children: [minutes] })]),
    )

    await dragOnto(folderHeader("資料"), folderHeader("議事録"), 0.5)

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("フォルダを自分の見出しの中央に落としても何も起きない", async () => {
    const { connection } = await renderSidebar(viewWith([docs()]))

    await dragOnto(folderHeader("資料"), folderHeader("資料"), 0.5)

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("ライブフォルダの見出しに落としても中には入れず、その前後に並べる", async () => {
    const inbox = pinnedLiveFolder("inbox", { title: "受信トレイ" })
    const { connection } = await renderSidebar(viewWith([docs(), inbox]))

    await dragOnto(folderHeader("資料"), folderHeader("受信トレイ"), 0.6)

    expect(commandsOf(connection.sentCommands, "MovePinnedItem")).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("docs"),
        placement: { spaceId: "work", parentId: null, index: 1 },
      },
    ])
  })

  it("ライブフォルダもドラッグして、別のフォルダの中へ移せる", async () => {
    const inbox = pinnedLiveFolder("inbox", { title: "受信トレイ" })
    const { connection } = await renderSidebar(viewWith([inbox, projects]))

    await dragOnto(folderHeader("受信トレイ"), folderHeader("プロジェクト"), 0.5)

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("inbox"),
        placement: { spaceId: "work", parentId: BookmarkId.make("projects"), index: 2 },
      },
    ])
  })

  it("分割ビューのピンもドラッグして、フォルダの中へ移せる", async () => {
    const pair = pinnedSplit("pair", [
      pinnedItem("left", { title: "設計書" }),
      pinnedItem("right", { title: "プレビュー" }),
    ])
    const { connection } = await renderSidebar(viewWith([pair, projects]))
    const pairRow = screen.getByRole("button", { name: "設計書" }).closest("li") as HTMLElement

    await dragOnto(pairRow, folderHeader("プロジェクト"), 0.5)

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("pair"),
        placement: { spaceId: "work", parentId: BookmarkId.make("projects"), index: 2 },
      },
    ])
  })

  it("フォルダを一時タブの行に落としても何も起きない", async () => {
    const { connection } = await renderSidebar(viewWith([docs()], [tabView(1)]))
    const tabRow = screen.getByRole("button", { name: "タブ 1" }).closest("li") as HTMLElement

    await dragOnto(folderHeader("資料"), tabRow, 0.9)

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("background が移動を断ったら、その理由を知らせる", async () => {
    await renderSidebar(viewWith([docs(), projects]), {
      respond: () => ({
        outcome: { _tag: "Failed", reason: "フォルダは 2 階層までしか入れられません" },
      }),
    })

    await dragOnto(folderHeader("資料"), folderHeader("プロジェクト"), 0.5)
    await tick()

    expect(screen.getByRole("status").textContent).toContain(
      "フォルダは 2 階層までしか入れられません",
    )
  })
})

describe("フォルダをドラッグしている間", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("別の閉じたフォルダの見出しに 250ms 留まると、そのフォルダを開く", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { connection } = await renderSidebar(viewWith([docs(), projects]))

    await fireEvent.dragStart(folderHeader("資料"))
    await dragOverAt(folderHeader("プロジェクト"), 0.5)
    vi.advanceTimersByTime(250)

    expect(commandsOf(connection.sentCommands, "SetFolderExpanded")).toStrictEqual([
      { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("projects"), isExpanded: true },
    ])
  })

  it("自分の見出しに留まっても、自分は開かない", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { connection } = await renderSidebar(viewWith([docs()]))

    await fireEvent.dragStart(folderHeader("資料"))
    await dragOverAt(folderHeader("資料"), 0.5)
    vi.advanceTimersByTime(1_000)

    expect(commandsOf(connection.sentCommands, "SetFolderExpanded")).toStrictEqual([])
  })
})
