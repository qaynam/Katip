import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { SpaceName } from "#modules/space"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { sidebarView, spaceView } from "../testing/view-builders"

const work = spaceView("work", { name: SpaceName.make("仕事"), color: "blue" })
const hobby = spaceView("hobby", { name: SpaceName.make("趣味") })

const startRenaming = async () => {
  const heading = screen.getByRole("heading", { name: "仕事" })
  await fireEvent.dblClick(within(heading).getByRole("button"))
  return screen.getByRole<HTMLInputElement>("textbox", { name: "Space の名前" })
}

const openSpaceMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: "Space のメニュー" }))

describe("Space の名前", () => {
  it("ダブルクリックで編集し、Enter で改名する", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    const input = await startRenaming()

    await fireEvent.input(input, { target: { value: " 本業 " } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RenameSpace", spaceId: "work", name: "本業" },
    ])
  })

  it("Escape で取り消すと改名しない", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    const input = await startRenaming()

    await fireEvent.input(input, { target: { value: "本業" } })
    await fireEvent.keyDown(input, { key: "Escape" })

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("空白だけの名前では改名しない", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    const input = await startRenaming()

    await fireEvent.input(input, { target: { value: "   " } })
    await fireEvent.blur(input)

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("編集中に新しいビューが届いても、入力中の文字は消えない", async () => {
    const { pushView } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))
    const input = await startRenaming()
    await fireEvent.input(input, { target: { value: "しご" } })

    await pushView(sidebarView({ spaces: [{ ...work, color: "red" }, hobby] }))

    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Space の名前" }).value).toBe(
      "しご",
    )
  })
})

describe("Space のメニュー", () => {
  it("色を選ぶとその色に変える", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    await openSpaceMenu()

    await fireEvent.click(screen.getByRole("menuitemradio", { name: "オレンジ" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RecolorSpace", spaceId: "work", color: "orange" },
    ])
  })

  it("9 色から選べ、今の色が選ばれた状態になっている", async () => {
    await renderSidebar(sidebarView({ spaces: [work] }))
    await openSpaceMenu()

    const swatches = screen.getAllByRole("menuitemradio")

    expect(swatches).toHaveLength(9)
    expect(screen.getByRole("menuitemradio", { name: "青" }).getAttribute("aria-checked")).toBe(
      "true",
    )
  })

  it("削除の確認では、開いている一時タブが別の Space に移ることを示し、承認すると削除する", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))
    await openSpaceMenu()

    await fireEvent.click(screen.getByRole("menuitem", { name: "Space を削除" }))
    const dialog = await screen.findByRole("alertdialog")
    await fireEvent.click(within(dialog).getByRole("button", { name: "Space を削除" }))

    expect(
      within(dialog).getByText(/開いている一時タブは閉じずに、別の Space に移動します/),
    ).toBeTruthy()
    expect(commandsOf(connection.sentCommands, "DeleteSpace")).toStrictEqual([
      { _tag: "DeleteSpace", spaceId: "work" },
    ])
  })

  it("Escape で確認を閉じると削除しない", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))
    await openSpaceMenu()
    await fireEvent.click(screen.getByRole("menuitem", { name: "Space を削除" }))
    await screen.findByRole("alertdialog")

    await fireEvent.keyDown(window, { key: "Escape" })

    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(commandsOf(connection.sentCommands, "DeleteSpace")).toStrictEqual([])
  })

  it("最後の 1 つの Space は削除できない", async () => {
    await renderSidebar(sidebarView({ spaces: [work] }))
    await openSpaceMenu()

    expect(screen.getByRole<HTMLButtonElement>("menuitem", { name: "Space を削除" }).disabled).toBe(
      true,
    )
  })

  it("設定画面を開ける", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    await openSpaceMenu()

    await fireEvent.click(screen.getByRole("menuitem", { name: "設定を開く" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "OpenSettings" }])
  })

  it("メニューのボタンをもう一度押すと閉じる", async () => {
    await renderSidebar(sidebarView({ spaces: [work] }))
    await openSpaceMenu()
    const button = screen.getByRole("button", { name: "Space のメニュー" })

    await fireEvent.pointerDown(button)
    await fireEvent.click(button)

    expect(screen.queryByRole("menu")).toBeNull()
  })
})
