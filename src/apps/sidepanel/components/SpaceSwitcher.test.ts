import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { SpaceName } from "#modules/space"
import { renderSidebar } from "../testing/render-sidebar"
import { sidebarView, spaceView } from "../testing/view-builders"

const work = spaceView("work", { name: SpaceName.make("仕事"), color: "grey" })
const hobby = spaceView("hobby", { name: SpaceName.make("趣味"), color: "blue" })
const reading = spaceView("reading", { name: SpaceName.make("読書"), color: "red" })

const switcher = () => screen.getByRole("navigation", { name: "Space の切り替え" })

describe("Space のスイッチャー", () => {
  it("チップを押すとその Space に切り替える", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))

    await fireEvent.click(within(switcher()).getByRole("button", { name: "趣味" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SwitchSpace", windowId: 1, spaceId: "hobby" },
    ])
  })

  it("表示中の Space のチップが選ばれた状態になる", async () => {
    await renderSidebar(sidebarView({ spaces: [work, hobby], activeSpaceId: hobby.id }))

    const current = within(switcher()).getByRole("button", { name: "趣味" })

    expect(current.getAttribute("aria-current")).toBe("true")
  })
})

describe("Space の作成", () => {
  const openForm = () => fireEvent.click(screen.getByRole("button", { name: "Space を作成" }))

  it("名前を入れて Enter を押すと、まだ使われていない色で作成する", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))
    await openForm()

    const input = screen.getByRole("textbox", { name: "新しい Space の名前" })
    await fireEvent.input(input, { target: { value: "旅行" } })
    await fireEvent.submit(input.closest("form") as HTMLFormElement)

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "CreateSpace", windowId: 1, name: "旅行", color: "red" },
    ])
  })

  it("選んだ色で作成する", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    await openForm()

    await fireEvent.click(screen.getByRole("radio", { name: "緑" }))
    await fireEvent.click(screen.getByRole("button", { name: "作成" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "CreateSpace", windowId: 1, color: "green" },
    ])
  })

  it("名前を空のまま作成すると、名前を省略して background に任せる", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby, reading] }))
    await openForm()

    await fireEvent.click(screen.getByRole("button", { name: "作成" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "CreateSpace", windowId: 1, color: "yellow" },
    ])
  })

  it("作成するとフォームを閉じてチップの並びに戻る", async () => {
    await renderSidebar(sidebarView({ spaces: [work] }))
    await openForm()

    await fireEvent.click(screen.getByRole("button", { name: "作成" }))

    expect(screen.queryByRole("form", { name: "Space を作成" })).toBeNull()
    expect(within(switcher()).getByRole("button", { name: "仕事" })).toBeTruthy()
  })

  it("Escape でフォームを閉じると作成しない", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    await openForm()

    await fireEvent.keyDown(screen.getByRole("textbox", { name: "新しい Space の名前" }), {
      key: "Escape",
    })

    expect(screen.queryByRole("form", { name: "Space を作成" })).toBeNull()
    expect(connection.sentCommands).toStrictEqual([])
  })
})

describe("横スワイプ", () => {
  const swipe = (deltaX: number) => fireEvent.wheel(screen.getByRole("main"), { deltaX, deltaY: 0 })

  it("右へ払うと次の Space へ切り替える", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby, reading] }))

    await swipe(40)

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SwitchSpace", windowId: 1, spaceId: "hobby" },
    ])
  })

  it("先頭の Space で左へ払うと、末尾の Space へ循環する", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby, reading] }))

    await swipe(-40)

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SwitchSpace", windowId: 1, spaceId: "reading" },
    ])
  })

  it("スイッチャーの上での横スクロールでは切り替えない", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))

    await fireEvent.wheel(within(switcher()).getByRole("list"), { deltaX: 40, deltaY: 0 })

    expect(connection.sentCommands).toStrictEqual([])
  })
})
