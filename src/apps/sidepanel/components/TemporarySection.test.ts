import { fireEvent, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { describe, expect, it, vi } from "vitest"
import { TabId } from "#platform/browser"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { sidebarView, spaceView, tabView } from "../testing/view-builders"

const viewWithTabs = (...tabs: ReadonlyArray<ReturnType<typeof tabView>>) =>
  sidebarView({ spaces: [spaceView("work", { temporaryTabs: tabs })] })

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

  it("「すべて閉じる」で表示中の Space の一時タブを閉じる", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1)))

    await fireEvent.click(screen.getByRole("button", { name: "すべて閉じる" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "CloseTemporaryTabs", windowId: 1, spaceId: "work" },
    ])
  })

  it("一時タブが無ければ「すべて閉じる」を出さない", async () => {
    await renderSidebar(viewWithTabs())

    expect(screen.queryByRole("button", { name: "すべて閉じる" })).toBeNull()
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
  it("一時タブを別の一時タブの上に落とすと、その位置へ並べ替えるコマンドを送る", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1), tabView(2)))

    await fireEvent.dragStart(rowOf("タブ 1"))
    await fireEvent.dragOver(rowOf("タブ 2"))
    await fireEvent.drop(rowOf("タブ 2"))

    expect(commandsOf(connection.sentCommands, "PlaceTabInTemporary")).toHaveLength(1)
  })

  it("ドラッグせずに落とされたもの（外部のリンクなど）は無視する", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1), tabView(2)))

    await fireEvent.dragOver(rowOf("タブ 2"))
    await fireEvent.drop(rowOf("タブ 2"))

    expect(connection.sentCommands).toStrictEqual([])
  })
})
