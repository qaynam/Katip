import { fireEvent, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BookmarkId, SplitViewId, TabId } from "#platform/browser"
import type { PinnedNodeView, SidebarCommand } from "#protocol"
import { commandsOf, dragOverAt, renderSidebar } from "../testing/render-sidebar"
import {
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  pinnedSplit,
  sidebarView,
  spaceView,
  tabView,
} from "../testing/view-builders"

const viewWithPins = (...nodes: ReadonlyArray<PinnedNodeView>) =>
  sidebarView({ spaces: [spaceView("work", { pinnedNodes: nodes })] })

const pinnedRegion = () => screen.getByRole("region", { name: "ピン留め" })

describe("フォルダ", () => {
  it("閉じたフォルダでは中身が隠れ、覗かせるアイテムだけが見出しの下に見える", async () => {
    const active = pinnedItem("active", {
      title: "開いている資料",
      openTab: openPinnedTab(tabView(1, { isActive: true })),
    })
    await renderSidebar(
      viewWithPins(
        pinnedFolder("folder", {
          title: "資料",
          isExpanded: false,
          children: [pinnedItem("hidden", { title: "隠れた資料" }), active],
          peekedItems: [active],
        }),
      ),
    )

    expect(within(pinnedRegion()).queryByText("隠れた資料")).toBeNull()
    expect(within(pinnedRegion()).getByText("開いている資料")).toBeTruthy()
  })

  it("閉じたフォルダの下に、分割ピンが開いたときと同じ横並びの 1 行で出る", async () => {
    const pair = pinnedSplit("pair", [
      pinnedItem("left", {
        title: "設計書",
        openTab: openPinnedTab(tabView(5, { splitViewId: SplitViewId.make(3) })),
      }),
      pinnedItem("right", { title: "プレビュー" }),
    ])
    await renderSidebar(
      viewWithPins(
        pinnedFolder("folder", {
          title: "資料",
          isExpanded: false,
          children: [pair],
          peekedItems: [pair],
        }),
      ),
    )

    const rowOf = (title: string) => screen.getByRole("button", { name: title }).closest("li")

    expect(rowOf("設計書")).not.toBeNull()
    expect(rowOf("設計書")).toBe(rowOf("プレビュー"))
  })

  it("覗かせている分割ピンも、ドラッグしてフォルダの外へ移せる", async () => {
    const pair = pinnedSplit("pair", [
      pinnedItem("left", {
        title: "設計書",
        openTab: openPinnedTab(tabView(5, { splitViewId: SplitViewId.make(3) })),
      }),
      pinnedItem("right", { title: "プレビュー" }),
    ])
    const { connection } = await renderSidebar(
      viewWithPins(
        pinnedFolder("folder", {
          title: "資料",
          isExpanded: false,
          children: [pair],
          peekedItems: [pair],
        }),
        pinnedItem("after", { title: "後ろのピン" }),
      ),
    )
    const rowOf = (title: string) =>
      screen.getByRole("button", { name: title }).closest("li") as HTMLElement

    await fireEvent.dragStart(rowOf("設計書"))
    await dragOverAt(rowOf("後ろのピン"), 0.9)
    await fireEvent.drop(rowOf("後ろのピン"))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("pair"),
        placement: { spaceId: "work", parentId: null, index: 2 },
      },
    ])
  })

  it("開いたフォルダでは中身がすべて見える", async () => {
    await renderSidebar(
      viewWithPins(
        pinnedFolder("folder", {
          isExpanded: true,
          children: [pinnedItem("a", { title: "資料 A" }), pinnedItem("b", { title: "資料 B" })],
        }),
      ),
    )

    expect(within(pinnedRegion()).getByText("資料 A")).toBeTruthy()
    expect(within(pinnedRegion()).getByText("資料 B")).toBeTruthy()
  })

  it("見出しをクリックすると、今と逆の開閉状態にする", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(pinnedFolder("folder", { title: "資料", isExpanded: false })),
    )

    await fireEvent.click(screen.getByRole("button", { name: "資料" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("folder"), isExpanded: true },
    ])
  })

  it("作成したフォルダは、すぐに名前を編集できる状態で現れる", async () => {
    const created = pinnedFolder("created", { title: "無題のフォルダ" })
    const { connection } = await renderSidebar(viewWithPins(), {
      respond: (command) => ({
        outcome: {
          _tag: "Succeeded",
          createdBookmarkId: command._tag === "CreateFolder" ? created.bookmarkId : null,
        },
        view: viewWithPins(created),
      }),
    })

    await fireEvent.click(screen.getByRole("button", { name: "Space のメニュー" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "新しいフォルダ" }))
    await tick()

    expect(connection.sentCommands).toContainEqual({
      _tag: "CreateFolder",
      spaceId: "work",
      parentId: null,
    })
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "フォルダの名前" }).value).toBe(
      "無題のフォルダ",
    )
  })

  it("サブフォルダを作れないフォルダのメニューには「新しいフォルダ」を出さない", async () => {
    await renderSidebar(
      viewWithPins(pinnedFolder("folder", { title: "資料", canCreateSubfolder: false })),
    )

    await fireEvent.contextMenu(screen.getByRole("button", { name: "資料" }))

    expect(screen.queryByRole("menuitem", { name: "新しいフォルダ" })).toBeNull()
    expect(screen.getByRole("menuitem", { name: "フォルダを削除" })).toBeTruthy()
  })

  it("削除は確認ダイアログで承認したときだけ行う", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(pinnedFolder("folder", { title: "資料" })),
    )

    await fireEvent.contextMenu(screen.getByRole("button", { name: "資料" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "フォルダを削除" }))
    await fireEvent.click(await screen.findByRole("button", { name: "削除" }))

    expect(commandsOf(connection.sentCommands, "DeleteFolder")).toStrictEqual([
      { _tag: "DeleteFolder", bookmarkId: BookmarkId.make("folder") },
    ])
  })
})

describe("閉じたピン", () => {
  it("クリックすると、そのピンをこのウィンドウで開く", async () => {
    const { connection } = await renderSidebar(viewWithPins(pinnedItem("pin", { title: "設計書" })))

    await fireEvent.click(screen.getByRole("button", { name: "設計書" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId: 1, bookmarkId: BookmarkId.make("pin") },
    ])
  })

  it("閉じるボタンを持たず、中クリックでも削除されない", async () => {
    const { connection } = await renderSidebar(viewWithPins(pinnedItem("pin", { title: "設計書" })))
    const row = screen.getByRole("button", { name: "設計書" }).closest("li")

    await fireEvent(row as HTMLElement, new MouseEvent("auxclick", { button: 1, bubbles: true }))

    expect(within(row as HTMLElement).queryByRole("button", { name: "タブを閉じる" })).toBeNull()
    expect(connection.sentCommands).toStrictEqual([])
  })

  it("右クリックから削除するときは確認を取り、取り消せば削除しない", async () => {
    const { connection } = await renderSidebar(viewWithPins(pinnedItem("pin", { title: "設計書" })))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "設計書" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "ピンを削除" }))
    await fireEvent.click(await screen.findByRole("button", { name: "キャンセル" }))

    expect(commandsOf(connection.sentCommands, "RemovePinnedItem")).toStrictEqual([])
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("ダブルクリックで名前を変えると、ピンの名前を変える", async () => {
    const { connection } = await renderSidebar(viewWithPins(pinnedItem("pin", { title: "設計書" })))

    await fireEvent.dblClick(screen.getByRole("button", { name: "設計書" }))
    const input = screen.getByRole("textbox", { name: "名前" })
    await fireEvent.input(input, { target: { value: "設計書 v2" } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RenamePinnedItem", bookmarkId: BookmarkId.make("pin"), title: "設計書 v2" },
    ])
  })
})

describe("開いているピン", () => {
  it("ピンした URL から移動していれば、favicon で元の URL に戻れ、名前の前に「/」が付く", async () => {
    const tab = tabView(5, { title: "検索結果" })
    const { connection } = await renderSidebar(
      viewWithPins(
        pinnedItem("pin", {
          title: "ドキュメント",
          openTab: openPinnedTab(tab, { hasNavigatedAway: true }),
        }),
      ),
    )
    const row = screen.getByRole("button", { name: "検索結果" }).closest("li") as HTMLElement

    await fireEvent.click(within(row).getByRole("button", { name: "ピンした URL に戻る" }))

    expect(within(row).getByText("/")).toBeTruthy()
    expect(connection.sentCommands).toStrictEqual<ReadonlyArray<SidebarCommand>>([
      { _tag: "ResetPinnedTab", tabId: TabId.make(5) },
    ])
  })

  it("ピンした URL にいる間は、元に戻すボタンを出さない", async () => {
    await renderSidebar(
      viewWithPins(
        pinnedItem("pin", { title: "ドキュメント", openTab: openPinnedTab(tabView(5)) }),
      ),
    )

    expect(screen.queryByRole("button", { name: "ピンした URL に戻る" })).toBeNull()
  })

  it("メニューから、ブックマークの URL を今のページの URL に置き換えられる", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(
        pinnedItem("pin", { title: "ドキュメント", openTab: openPinnedTab(tabView(5)) }),
      ),
    )

    await fireEvent.contextMenu(screen.getByRole("button", { name: "ドキュメント" }))
    await fireEvent.click(
      screen.getByRole("menuitem", { name: "ブックマークの URL を現在の URL に置き換え" }),
    )

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "ReplacePinnedUrl", tabId: TabId.make(5) },
    ])
  })
})

describe("分割ビューのピン", () => {
  const openSplit = (splitViewId: number) =>
    pinnedSplit("split", [
      pinnedItem("left", {
        title: "設計書",
        openTab: openPinnedTab(tabView(5, { splitViewId: SplitViewId.make(splitViewId) })),
      }),
      pinnedItem("right", {
        title: "プレビュー",
        openTab: openPinnedTab(tabView(6, { splitViewId: SplitViewId.make(splitViewId) })),
      }),
    ])
  const closedSplit = pinnedSplit("split", [
    pinnedItem("left", { title: "設計書" }),
    pinnedItem("right", { title: "プレビュー" }),
  ])
  const rowOf = (title: string) =>
    screen.getByRole("button", { name: title }).closest("li") as HTMLElement

  it("フォルダの中でも、2 つのピンを左右に並べて 1 つの行に表示する", async () => {
    await renderSidebar(viewWithPins(pinnedFolder("folder", { children: [closedSplit] })))

    expect(rowOf("設計書")).toBe(rowOf("プレビュー"))
  })

  it("開いている側をクリックすると、そのタブをアクティブにする", async () => {
    const { connection } = await renderSidebar(viewWithPins(openSplit(9)))

    await fireEvent.click(screen.getByRole("button", { name: "プレビュー" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "ActivateTab", tabId: TabId.make(6) }])
  })

  it("閉じていれば、どちらの側をクリックしても 2 つを分割ビューで開く", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedSplit))

    await fireEvent.click(screen.getByRole("button", { name: "プレビュー" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId: 1, bookmarkId: BookmarkId.make("split") },
    ])
  })

  it("閉じている側には閉じるボタンを出さない", async () => {
    await renderSidebar(viewWithPins(closedSplit))

    expect(screen.queryByRole("button", { name: "タブを閉じる" })).toBeNull()
  })

  it("「名前を変更」は、右クリックした側のピンの名前を変える", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedSplit))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "プレビュー" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "名前を変更" }))
    const input = screen.getByRole("textbox", { name: "名前" })
    await fireEvent.input(input, { target: { value: "ステージング" } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RenamePinnedItem", bookmarkId: BookmarkId.make("right"), title: "ステージング" },
    ])
  })

  it("「ピンを削除」は確認で承認したときだけ、分割ビューのピンごと削除する", async () => {
    const { connection } = await renderSidebar(viewWithPins(openSplit(9)))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "設計書" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "ピンを削除" }))
    await fireEvent.click(await screen.findByRole("button", { name: "削除" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RemovePinnedItem", bookmarkId: BookmarkId.make("split") },
    ])
  })

  it("開いていれば、一時タブの行へ落とすとピンを外して分割ビューのままその位置に置く", async () => {
    const { connection } = await renderSidebar(
      sidebarView({
        spaces: [spaceView("work", { pinnedNodes: [openSplit(9)], temporaryTabs: [tabView(1)] })],
      }),
    )

    await fireEvent.dragStart(rowOf("設計書"))
    await dragOverAt(rowOf("タブ 1"), 0.9)
    await fireEvent.drop(rowOf("タブ 1"))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceSplitInTemporary",
        splitViewId: SplitViewId.make(9),
        spaceId: "work",
        placement: { _tag: "Below", tabId: TabId.make(1) },
      },
    ])
  })

  it("閉じていれば、一時タブの行へ落としても何も起きない", async () => {
    const { connection } = await renderSidebar(
      sidebarView({
        spaces: [spaceView("work", { pinnedNodes: [closedSplit], temporaryTabs: [tabView(1)] })],
      }),
    )

    await fireEvent.dragStart(rowOf("設計書"))
    await dragOverAt(rowOf("タブ 1"), 0.9)
    await fireEvent.drop(rowOf("タブ 1"))

    expect(connection.sentCommands).toStrictEqual([])
  })
})

describe("ピン留めを読み込めないとき", () => {
  it("空とは区別し、再読み込みを案内する", async () => {
    const { onReload } = await renderSidebar(
      sidebarView({ spaces: [spaceView("work", { pinned: { _tag: "Unavailable" } })] }),
    )

    await fireEvent.click(screen.getByRole("button", { name: "再読み込み" }))

    expect(screen.queryByText("タブをここにドラッグしてピン留め")).toBeNull()
    expect(onReload).toHaveBeenCalledOnce()
  })

  it("ピン留めが空なら、ドラッグで追加できることを案内する", async () => {
    await renderSidebar(viewWithPins())

    expect(screen.getByText("タブをここにドラッグしてピン留め")).toBeTruthy()
  })
})

describe("ドラッグ中", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("閉じたフォルダの見出しに 250ms 留まると、そのフォルダを開く", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { connection } = await renderSidebar(
      sidebarView({
        spaces: [
          spaceView("work", {
            pinnedNodes: [pinnedFolder("folder", { title: "資料", isExpanded: false })],
            temporaryTabs: [tabView(1)],
          }),
        ],
      }),
    )
    const expandCommands = () => commandsOf(connection.sentCommands, "SetFolderExpanded")
    await fireEvent.dragStart(
      screen.getByRole("button", { name: "タブ 1" }).closest("li") as HTMLElement,
    )
    await fireEvent.dragOver(screen.getByRole("button", { name: "資料" }))

    vi.advanceTimersByTime(249)
    expect(expandCommands()).toStrictEqual([])
    vi.advanceTimersByTime(1)

    expect(expandCommands()).toStrictEqual([
      { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("folder"), isExpanded: true },
    ])
  })
})
