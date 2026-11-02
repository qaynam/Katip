import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import type { FolderIcon } from "#modules/pinned"
import { BookmarkId } from "#platform/browser"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { pinnedFolder, sidebarView, spaceView } from "../testing/view-builders"

const viewWithFolder = (icon: FolderIcon | null = null) =>
  sidebarView({
    spaces: [spaceView("work", { pinnedNodes: [pinnedFolder("docs", { title: "資料", icon })] })],
  })

const folderHeader = () => screen.getByRole("button", { name: "資料" })

const openPicker = async () => {
  await fireEvent.contextMenu(folderHeader())
  await fireEvent.click(screen.getByRole("menuitem", { name: "アイコンを変更" }))
  return screen.getByRole("dialog", { name: "フォルダのアイコン" })
}

describe("フォルダのアイコンの変更", () => {
  it("フォルダのメニューから、標準のアイコンと選べるアイコンを並べた小窓を開ける", async () => {
    await renderSidebar(viewWithFolder())

    const picker = await openPicker()

    const names = within(picker)
      .getAllByRole("button")
      .map((choice) => choice.getAttribute("aria-label"))
    expect(names.slice(0, 3)).toStrictEqual(["標準のアイコン", "星", "しおり"])
    expect(names).toHaveLength(25)
  })

  it("アイコンを選ぶと、そのフォルダのアイコンにするよう頼み、小窓を閉じる", async () => {
    const { connection } = await renderSidebar(viewWithFolder())
    await openPicker()

    await fireEvent.click(screen.getByRole("button", { name: "惑星" }))

    expect(commandsOf(connection.sentCommands, "SetFolderIcon")).toStrictEqual([
      { _tag: "SetFolderIcon", bookmarkId: BookmarkId.make("docs"), icon: "planet" },
    ])
    expect(screen.queryByRole("dialog", { name: "フォルダのアイコン" })).toBeNull()
  })

  it("標準のアイコンを選ぶと、フォルダの絵に戻すよう頼む", async () => {
    const { connection } = await renderSidebar(viewWithFolder("star"))
    await openPicker()

    await fireEvent.click(screen.getByRole("button", { name: "標準のアイコン" }))

    expect(commandsOf(connection.sentCommands, "SetFolderIcon")).toStrictEqual([
      { _tag: "SetFolderIcon", bookmarkId: BookmarkId.make("docs"), icon: null },
    ])
  })

  it("今のアイコンだけを、選んでいるものとして示す", async () => {
    await renderSidebar(viewWithFolder("star"))
    const picker = await openPicker()

    const pressed = within(picker)
      .getAllByRole("button", { pressed: true })
      .map((choice) => choice.getAttribute("aria-label"))
    expect(pressed).toStrictEqual(["星"])
  })

  it("開くと今のアイコンにフォーカスがあり、矢印キーで左右と上下の行へ動かせる", async () => {
    await renderSidebar(viewWithFolder("star"))
    await openPicker()
    const focusedName = () => document.activeElement?.getAttribute("aria-label")
    const opened = focusedName()

    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" })
    const afterRight = focusedName()
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" })

    expect([opened, afterRight, focusedName()]).toStrictEqual(["星", "しおり", "ベル"])
  })

  it("Escape で、何も頼まずに小窓を閉じ、フォルダにフォーカスを戻す", async () => {
    const { connection } = await renderSidebar(viewWithFolder())
    await openPicker()

    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" })

    expect(screen.queryByRole("dialog", { name: "フォルダのアイコン" })).toBeNull()
    expect(commandsOf(connection.sentCommands, "SetFolderIcon")).toStrictEqual([])
    expect(document.activeElement).toBe(folderHeader())
  })

  it("アイコンを選んだフォルダは、フォルダの絵の代わりにそのアイコンを見出しに出す", async () => {
    await renderSidebar(viewWithFolder("moon"))

    const shown = folderHeader().querySelector<HTMLElement>("[data-folder-icon]")

    expect(shown?.dataset["folderIcon"]).toBe("moon")
  })
})
