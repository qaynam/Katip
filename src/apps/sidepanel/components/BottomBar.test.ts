import { fireEvent, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { describe, expect, it } from "vitest"
import { SpaceId, SpaceName } from "#modules/space"
import { themeOf } from "#modules/theme"
import type { SidebarCommand, SidebarView } from "#protocol"
import type { CommandResponse } from "../connection/memory-connection"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { sidebarView, spaceView } from "../testing/view-builders"

const work = spaceView("work", { name: SpaceName.make("仕事") })
const hobby = spaceView("hobby", { name: SpaceName.make("趣味") })
const reading = spaceView("reading", { name: SpaceName.make("読書") })

const spaceBar = () => screen.getByRole("navigation", { name: "Space の切り替え" })

// background と同じく、作成した Space やスイッチ先の Space を表示中にしたビューを返す
const respondLikeBackground = (
  command: SidebarCommand,
  current: SidebarView | null,
): CommandResponse => {
  const succeeded = { _tag: "Succeeded", createdBookmarkId: null } as const
  if (current === null) return { outcome: succeeded }
  if (command._tag === "SwitchSpace") {
    return { outcome: succeeded, view: { ...current, activeSpaceId: command.spaceId } }
  }
  if (command._tag === "CreateSpace") {
    const created = spaceView("created", {
      name: SpaceName.make("スペース 3"),
      ...(command.theme === undefined ? {} : { theme: command.theme }),
    })
    return {
      outcome: succeeded,
      view: { ...current, spaces: [...current.spaces, created], activeSpaceId: created.id },
    }
  }
  return { outcome: succeeded }
}

describe("Space の印", () => {
  it("印を押すとその Space に切り替える", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))

    await fireEvent.click(within(spaceBar()).getByRole("button", { name: "趣味" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SwitchSpace", windowId: 1, spaceId: "hobby" },
    ])
  })

  it("表示中の Space の印が選ばれた状態になる", async () => {
    await renderSidebar(sidebarView({ spaces: [work, hobby], activeSpaceId: hobby.id }))

    const current = within(spaceBar()).getByRole("button", { name: "趣味" })

    expect(current.getAttribute("aria-current")).toBe("true")
  })

  it("右クリックすると、その Space のメニューを開く", async () => {
    await renderSidebar(sidebarView({ spaces: [work, hobby] }))

    await fireEvent.contextMenu(within(spaceBar()).getByRole("button", { name: "趣味" }))

    expect(screen.getByRole("menu", { name: "Space のメニュー" })).toBeTruthy()
  })

  it("表示していない Space のテーマを編集すると、その Space に切り替えてからピッカーを開く", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }), {
      respond: respondLikeBackground,
    })
    await fireEvent.contextMenu(within(spaceBar()).getByRole("button", { name: "趣味" }))

    await fireEvent.click(screen.getByRole("menuitem", { name: "テーマを編集" }))
    await tick()

    expect(commandsOf(connection.sentCommands, "SwitchSpace")).toStrictEqual([
      { _tag: "SwitchSpace", windowId: 1, spaceId: "hobby" },
    ])
    expect(screen.getByRole("heading", { name: "趣味" })).toBeTruthy()
    expect(screen.getByRole("dialog", { name: "テーマ" })).toBeTruthy()
  })
})

describe("Space の作成", () => {
  const create = () => fireEvent.click(screen.getByRole("button", { name: "Space を作成" }))

  it("まだ使われていない色のテーマで、このウィンドウに Space を作る", async () => {
    const used = themeOf([{ hue: 350, chroma: 0.55 }])
    const { connection } = await renderSidebar(
      sidebarView({ spaces: [{ ...work, theme: used }, hobby] }),
    )

    await create()

    const [command] = commandsOf(connection.sentCommands, "CreateSpace")
    expect(command).toMatchObject({ _tag: "CreateSpace", windowId: 1 })
    expect(command?._tag === "CreateSpace" && command.theme?.colors).not.toStrictEqual(used.colors)
    expect(command?._tag === "CreateSpace" && command.theme?.colors.length).toBe(1)
  })

  it("作った Space が表示されたら、名前の編集とテーマのピッカーを始める", async () => {
    await renderSidebar(sidebarView({ spaces: [work, hobby] }), {
      respond: respondLikeBackground,
    })

    await create()
    await tick()

    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Space の名前" }).value).toBe(
      "スペース 3",
    )
    expect(screen.getByRole("dialog", { name: "テーマ" })).toBeTruthy()
  })

  it("作成に失敗したら、あとで別の Space に切り替えても編集を始めない", async () => {
    const { pushView } = await renderSidebar(sidebarView({ spaces: [work, hobby] }), {
      respond: () => ({ outcome: { _tag: "Failed", reason: "作成できませんでした" } }),
    })
    await create()
    await tick()

    await pushView(
      sidebarView({
        spaces: [work, hobby, spaceView("later", { name: SpaceName.make("あとで") })],
        activeSpaceId: SpaceId.make("later"),
      }),
    )

    expect(screen.queryByRole("textbox", { name: "Space の名前" })).toBeNull()
    expect(screen.queryByRole("dialog", { name: "テーマ" })).toBeNull()
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

  it("Space の印の並びの上での横スクロールでは切り替えない", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))

    await fireEvent.wheel(within(spaceBar()).getByRole("list"), { deltaX: 40, deltaY: 0 })

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("テーマのピッカーを開いている間は切り替えない", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))
    await fireEvent.click(screen.getByRole("button", { name: "Space のメニュー" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "テーマを編集" }))

    await swipe(40)

    expect(commandsOf(connection.sentCommands, "SwitchSpace")).toStrictEqual([])
  })
})
