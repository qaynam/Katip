import { fireEvent, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BookmarkId, SplitViewId, TabId } from "#platform/browser"
import type { TemporaryEntry } from "#protocol"
import { commandsOf, dragOverAt, renderSidebar } from "../testing/render-sidebar"
import {
  pinnedFolder,
  pinnedItem,
  sidebarView,
  spaceView,
  tabView,
  temporarySplit,
  temporaryTab,
} from "../testing/view-builders"

const viewWithTabs = (...tabs: ReadonlyArray<ReturnType<typeof tabView>>) =>
  sidebarView({ spaces: [spaceView("work", { temporaryTabs: tabs })] })

const viewWithEntries = (
  entries: ReadonlyArray<TemporaryEntry>,
  options: { readonly canSplit?: boolean } = {},
) =>
  sidebarView({
    spaces: [
      spaceView("work", {
        temporaryEntries: entries,
        pinnedNodes: [pinnedItem("existing"), pinnedFolder("folder", { title: "資料" })],
      }),
    ],
    canSplit: options.canSplit ?? true,
  })

const redditAndGoogle = temporarySplit(
  9,
  tabView(1, { title: "Reddit" }),
  tabView(2, { title: "Google" }),
)

const rowOf = (title: string) => {
  const row = screen.getByRole("button", { name: title }).closest("li")
  if (row === null) throw new Error(`${title} の行が無い`)
  return row
}

describe("一時タブの行", () => {
  it("クリックするとそのタブをアクティブにする", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1)))

    await fireEvent.click(screen.getByRole("button", { name: "タブ 1" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "ActivateTab", tabId: TabId.make(1) }])
  })

  it("× を押すとそのタブを閉じる", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1), tabView(2)))

    await fireEvent.click(within(rowOf("タブ 2")).getByRole("button", { name: "タブを閉じる" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "CloseTab", tabId: TabId.make(2) }])
  })

  it("中クリックするとそのタブを閉じる", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1)))

    await fireEvent(rowOf("タブ 1"), new MouseEvent("auxclick", { button: 1, bubbles: true }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "CloseTab", tabId: TabId.make(1) }])
  })

  it("「クリア」で表示中の Space の一時タブをすべて閉じる", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1)))

    await fireEvent.click(screen.getByRole("button", { name: "クリア" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "CloseTemporaryTabs", windowId: 1, spaceId: "work" },
    ])
  })

  it("一時タブが無ければ「クリア」を出さない", async () => {
    await renderSidebar(viewWithTabs())

    expect(screen.queryByRole("button", { name: "クリア" })).toBeNull()
  })
})

describe("一時タブの分割ビューの行", () => {
  it("2 つのタブを左右に並べて 1 つの行に表示する", async () => {
    await renderSidebar(viewWithEntries([redditAndGoogle, temporaryTab(tabView(3))]))

    expect(rowOf("Reddit")).toBe(rowOf("Google"))
    expect(rowOf("タブ 3")).not.toBe(rowOf("Reddit"))
  })

  it("左半分をクリックすると、左のタブをアクティブにする", async () => {
    const { connection } = await renderSidebar(viewWithEntries([redditAndGoogle]))

    await fireEvent.click(screen.getByRole("button", { name: "Reddit" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "ActivateTab", tabId: TabId.make(1) }])
  })

  it("右半分の × を押すと、右のタブだけを閉じる", async () => {
    const { connection } = await renderSidebar(viewWithEntries([redditAndGoogle]))

    await fireEvent.click(
      within(screen.getByRole("group", { name: "Google" })).getByRole("button", {
        name: "タブを閉じる",
      }),
    )

    expect(connection.sentCommands).toStrictEqual([{ _tag: "CloseTab", tabId: TabId.make(2) }])
  })

  it("右クリックの「分割を解除」で、2 つのタブを別々の行に戻す", async () => {
    const { connection } = await renderSidebar(viewWithEntries([redditAndGoogle]))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Google" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "分割を解除" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "Unsplit", splitViewId: SplitViewId.make(9) },
    ])
  })

  it("右クリックの「ピン留め」で、分割ビューのままピン留めの末尾に加える", async () => {
    const { connection } = await renderSidebar(viewWithEntries([redditAndGoogle]))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Reddit" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "ピン留め" }))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceSplitInPinned",
        splitViewId: SplitViewId.make(9),
        placement: { spaceId: "work", parentId: null, index: 2 },
      },
    ])
  })

  it("分割ビューを作れない環境では「分割を解除」を出さない", async () => {
    await renderSidebar(viewWithEntries([redditAndGoogle], { canSplit: false }))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Reddit" }))

    expect(screen.queryByRole("menuitem", { name: "分割を解除" })).toBeNull()
  })
})

describe("行のツールチップ", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const hover = (title: string) =>
    fireEvent.pointerEnter(rowOf(title), { clientX: 40, clientY: 60, pointerId: 1 })

  it("マウスを乗せてしばらくすると、タイトルと名前の変え方を示す", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    await renderSidebar(viewWithTabs(tabView(1, { title: "受信トレイ" })))

    await hover("受信トレイ")
    vi.advanceTimersByTime(1_000)
    await tick()

    const tooltip = screen.getByRole("tooltip")
    expect(tooltip.textContent).toContain("受信トレイ")
    expect(tooltip.textContent).toContain("ダブルクリックで名前を変更")
  })

  it("すぐにマウスを離せばツールチップを出さない", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    await renderSidebar(viewWithTabs(tabView(1, { title: "受信トレイ" })))

    await hover("受信トレイ")
    await fireEvent.pointerLeave(rowOf("受信トレイ"))
    vi.advanceTimersByTime(1_000)
    await tick()

    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})

describe("タブ名の編集", () => {
  const startEditing = async (title: string) => {
    await fireEvent.dblClick(screen.getByRole("button", { name: title }))
    return screen.getByRole("textbox", { name: "名前" })
  }

  it("ダブルクリックで編集し、Enter で新しい名前を付ける", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1, { title: "受信トレイ" })))
    const input = await startEditing("受信トレイ")

    await fireEvent.input(input, { target: { value: "メール" } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(commandsOf(connection.sentCommands, "RenameTab")).toStrictEqual([
      { _tag: "RenameTab", tabId: TabId.make(1), title: "メール" },
    ])
  })

  it("空にして確定すると、付けた名前を解除する", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1, { title: "メール" })))
    const input = await startEditing("メール")

    await fireEvent.input(input, { target: { value: "" } })
    await fireEvent.blur(input)

    expect(commandsOf(connection.sentCommands, "RenameTab")).toStrictEqual([
      { _tag: "RenameTab", tabId: TabId.make(1), title: "" },
    ])
  })

  it("Escape で取り消すと名前は変えない", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1, { title: "メール" })))
    const input = await startEditing("メール")

    await fireEvent.input(input, { target: { value: "別の名前" } })
    await fireEvent.keyDown(input, { key: "Escape" })

    expect(commandsOf(connection.sentCommands, "RenameTab")).toStrictEqual([])
    expect(screen.getByRole("button", { name: "メール" })).toBeTruthy()
  })

  it("編集中に新しいビューが届いても、入力中の文字は消えない", async () => {
    const { pushView } = await renderSidebar(viewWithTabs(tabView(1, { title: "メール" })))
    const input = await startEditing("メール")
    await fireEvent.input(input, { target: { value: "書きかけの名" } })

    await pushView(viewWithTabs(tabView(1, { title: "メール (3)", isLoading: true }), tabView(2)))

    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "名前" }).value).toBe(
      "書きかけの名",
    )
  })
})

describe("アクティブなタブへのスクロール", () => {
  it("別のタブがアクティブになると、その行が見える位置までスクロールする", async () => {
    const { pushView } = await renderSidebar(
      viewWithTabs(tabView(1, { isActive: true }), tabView(2)),
    )
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()

    await pushView(viewWithTabs(tabView(1), tabView(2, { isActive: true })))

    expect(scrollIntoView.mock.contexts).toStrictEqual([rowOf("タブ 2")])
  })

  it("読み込み状態が変わっただけではスクロールしない", async () => {
    const { pushView } = await renderSidebar(
      viewWithTabs(tabView(1, { isActive: true }), tabView(2)),
    )
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()

    await pushView(viewWithTabs(tabView(1, { isActive: true }), tabView(2, { isLoading: true })))
    await tick()

    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe("ドラッグ＆ドロップ", () => {
  it("一時タブを別の一時タブの上端に落とすと、その上へ並べ替える", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1), tabView(2)))

    await fireEvent.dragStart(rowOf("タブ 2"))
    await dragOverAt(rowOf("タブ 1"), 0.1)
    await fireEvent.drop(rowOf("タブ 1"))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceTabInTemporary",
        tabId: TabId.make(2),
        spaceId: "work",
        placement: { _tag: "Above", tabId: TabId.make(1) },
      },
    ])
  })

  it("一時タブを別の一時タブの中央に落とすと、その右に並べて分割ビューにする", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1), tabView(2)))

    await fireEvent.dragStart(rowOf("タブ 2"))
    await dragOverAt(rowOf("タブ 1"), 0.5)
    await fireEvent.drop(rowOf("タブ 1"))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SplitTabs", tabId: TabId.make(2), withTabId: TabId.make(1) },
    ])
  })

  it("分割ビューを作れない環境で分割の位置に落とすと、並べ替えずに対応していないことを知らせる", async () => {
    const { connection } = await renderSidebar(
      viewWithEntries([temporaryTab(tabView(1)), temporaryTab(tabView(2))], { canSplit: false }),
    )

    await fireEvent.dragStart(rowOf("タブ 2"))
    await dragOverAt(rowOf("タブ 1"), 0.5)
    await fireEvent.drop(rowOf("タブ 1"))

    expect(connection.sentCommands).toStrictEqual([])
    expect(screen.getByRole("status").textContent).toContain(
      "このブラウザは分割ビューに対応していません（Chrome 155 以降で使えます）",
    )
  })

  it("分割ビューを作れない環境でも、行の上端に落とせばその上へ並べ替える", async () => {
    const { connection } = await renderSidebar(
      viewWithEntries([temporaryTab(tabView(1)), temporaryTab(tabView(2))], { canSplit: false }),
    )

    await fireEvent.dragStart(rowOf("タブ 2"))
    await dragOverAt(rowOf("タブ 1"), 0.1)
    await fireEvent.drop(rowOf("タブ 1"))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceTabInTemporary",
        tabId: TabId.make(2),
        spaceId: "work",
        placement: { _tag: "Above", tabId: TabId.make(1) },
      },
    ])
  })

  it("分割ビューの行の中央に落としても、3 つ目のタブは並べず前後へ並べ替える", async () => {
    const { connection } = await renderSidebar(
      viewWithEntries([redditAndGoogle, temporaryTab(tabView(3))]),
    )

    await fireEvent.dragStart(rowOf("タブ 3"))
    await dragOverAt(rowOf("Reddit"), 0.4)
    await fireEvent.drop(rowOf("Reddit"))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceTabInTemporary",
        tabId: TabId.make(3),
        spaceId: "work",
        placement: { _tag: "Above", tabId: TabId.make(1) },
      },
    ])
  })

  it("分割ビューの行をピン留めのフォルダに落とすと、分割ビューのままフォルダの中にピン留めする", async () => {
    const { connection } = await renderSidebar(viewWithEntries([redditAndGoogle]))
    const folderHeader = screen.getByRole("button", { name: "資料" })

    await fireEvent.dragStart(rowOf("Reddit"))
    await dragOverAt(folderHeader, 0.5)
    await fireEvent.drop(folderHeader)

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceSplitInPinned",
        splitViewId: SplitViewId.make(9),
        placement: { spaceId: "work", parentId: BookmarkId.make("folder"), index: 0 },
      },
    ])
  })

  it("ドラッグせずに落とされたもの（外部のリンクなど）は無視する", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1), tabView(2)))

    await fireEvent.dragOver(rowOf("タブ 2"))
    await fireEvent.drop(rowOf("タブ 2"))

    expect(connection.sentCommands).toStrictEqual([])
  })
})
