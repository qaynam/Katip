import { fireEvent, screen, within } from "@testing-library/svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SpaceName } from "#modules/space"
import {
  appearanceOf,
  colorAtPoint,
  MAX_THEME_COLORS,
  neutralTheme,
  presetPages,
  type SpaceTheme,
} from "#modules/theme"
import type { SidebarCommand } from "#protocol"
import { FIELD_EDGE_INSET_PX } from "../logic/picker-geometry"
import { commandsOf, renderSidebar, shownAppearance } from "../testing/render-sidebar"
import { sidebarView, spaceView } from "../testing/view-builders"

const yellow = { hue: 90, chroma: 0.8 }
const red = { hue: 25, chroma: 0.8 }

const tunedTheme: SpaceTheme = {
  mode: "dark",
  colors: [yellow],
  intensity: 0.3,
  grain: 0.6,
}

const openPicker = async (theme: SpaceTheme) => {
  const rendered = await renderSidebar(
    sidebarView({ spaces: [spaceView("work", { name: SpaceName.make("仕事"), theme })] }),
  )
  await fireEvent.click(screen.getByRole("button", { name: "Space のメニュー" }))
  await fireEvent.click(screen.getByRole("menuitem", { name: "テーマを編集" }))
  return { ...rendered, picker: screen.getByRole("dialog", { name: "テーマ" }) }
}

const sentThemes = (commands: ReadonlyArray<SidebarCommand>) =>
  commandsOf(commands, "SetSpaceTheme").map((command) =>
    command._tag === "SetSpaceTheme" ? command.theme : null,
  )

// jsdom はレイアウトを持たないため、色フィールドの大きさを与える
const fieldOf = (picker: HTMLElement) => {
  const field = within(picker).getByRole("group", { name: "色" })
  vi.spyOn(field, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 300, height: 268 }),
  )
  return field
}
const fieldCenter = { x: 150, y: 134 }
const fieldRadius = Math.min(fieldCenter.x, fieldCenter.y) - FIELD_EDGE_INSET_PX

describe("色を選ぶ前のピッカー", () => {
  it("色の選び方を案内し、強さのつまみとグレインの目盛りを出さない", async () => {
    const { picker } = await openPicker(neutralTheme)

    expect(within(picker).getByText("クリックしてこの Space の色を選ぶ")).toBeTruthy()
    expect(picker.querySelector("[data-thumb]")).toBeNull()
    expect(picker.querySelector("[data-tick]")).toBeNull()
    expect(within(picker).getByRole("slider", { name: "色の強さ" }).ariaDisabled).toBe("true")
  })

  it("色の数を増やしも減らしもできない", async () => {
    const { picker } = await openPicker(neutralTheme)

    const buttons = ["色を減らす", "色を増やす"].map(
      (name) => within(picker).getByRole<HTMLButtonElement>("button", { name }).disabled,
    )

    expect(buttons).toStrictEqual([true, true])
  })

  it("フィールドを押すと、押した位置の色を主色にしてテーマを送る", async () => {
    const { connection, picker } = await openPicker(neutralTheme)
    const field = fieldOf(picker)
    const at = { clientX: fieldCenter.x + fieldRadius, clientY: fieldCenter.y, pointerId: 1 }

    await fireEvent.pointerDown(field, at)
    await fireEvent.pointerUp(field, at)

    expect(sentThemes(connection.sentCommands).at(-1)).toStrictEqual({
      ...neutralTheme,
      colors: [colorAtPoint({ x: 1, y: 0 })],
    })
  })
})

describe("色を選んだあとのピッカー", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("強さのつまみとグレインの目盛りを出す", async () => {
    const { picker } = await openPicker(tunedTheme)

    expect(picker.querySelector("[data-thumb]")).not.toBeNull()
    expect(picker.querySelector("[data-tick]")).not.toBeNull()
  })

  it("ドラッグ中は送る回数を間引き、離したときに最後の位置の色を必ず送る", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { connection, picker } = await openPicker(tunedTheme)
    const field = fieldOf(picker)
    const pointerAt = (dy: number) => ({
      clientX: fieldCenter.x,
      clientY: fieldCenter.y - dy,
      pointerId: 1,
    })

    await fireEvent.pointerDown(field, pointerAt(10))
    await fireEvent.pointerMove(field, pointerAt(20))
    await fireEvent.pointerMove(field, pointerAt(30))
    await fireEvent.pointerUp(field, pointerAt(fieldRadius / 2))

    expect(sentThemes(connection.sentCommands).map((theme) => theme?.colors)).toStrictEqual([
      [colorAtPoint({ x: 0, y: 10 / fieldRadius })],
      [colorAtPoint({ x: 0, y: 0.5 })],
    ])
  })

  it("ドラッグ中は background の応答を待たずに、サイドバー全体をその色で塗る", async () => {
    const { container, picker } = await openPicker(tunedTheme)
    const field = fieldOf(picker)

    await fireEvent.pointerDown(field, {
      clientX: fieldCenter.x,
      clientY: fieldCenter.y + fieldRadius,
      pointerId: 1,
    })

    const dragged = { ...tunedTheme, colors: [colorAtPoint({ x: 0, y: -1 })] }
    expect(shownAppearance(container).background).toBe(appearanceOf(dragged, "light").background)
  })

  it("色の点を矢印キーで動かせる", async () => {
    const { connection, picker } = await openPicker({
      ...tunedTheme,
      colors: [{ hue: 0, chroma: 0 }],
    })
    const primary = within(picker).getByRole("button", { name: "主色" })

    await fireEvent.keyDown(primary, { key: "ArrowUp" })
    await fireEvent.keyUp(primary, { key: "ArrowUp" })

    expect(sentThemes(connection.sentCommands).at(-1)?.colors).toStrictEqual([
      colorAtPoint({ x: 0, y: 0.05 }),
    ])
  })

  it("＋ で色を足してグラデーションにし、− で最後に足した色を外す", async () => {
    const { connection, picker } = await openPicker(tunedTheme)

    await fireEvent.click(within(picker).getByRole("button", { name: "色を増やす" }))
    await fireEvent.click(within(picker).getByRole("button", { name: "色を減らす" }))

    expect(sentThemes(connection.sentCommands).map((theme) => theme?.colors.length)).toStrictEqual([
      2, 1,
    ])
  })

  it("主色だけのときは減らせず、上限の色数では増やせない", async () => {
    const { picker: single, unmount } = await openPicker(tunedTheme)
    const canRemoveFromSingle = !within(single).getByRole<HTMLButtonElement>("button", {
      name: "色を減らす",
    }).disabled
    unmount()

    const { picker: full } = await openPicker({
      ...tunedTheme,
      colors: [yellow, red, { hue: 140, chroma: 0.7 }].slice(0, MAX_THEME_COLORS),
    })
    const canAddToFull = !within(full).getByRole<HTMLButtonElement>("button", {
      name: "色を増やす",
    }).disabled

    expect([canRemoveFromSingle, canAddToFull]).toStrictEqual([false, false])
  })

  it("強さはキーボードで調整でき、キーを離すと送る", async () => {
    const { connection, picker } = await openPicker(tunedTheme)
    const slider = within(picker).getByRole("slider", { name: "色の強さ" })

    await fireEvent.keyDown(slider, { key: "ArrowRight" })
    await fireEvent.keyUp(slider, { key: "ArrowRight" })

    expect(sentThemes(connection.sentCommands).at(-1)).toStrictEqual({
      ...tunedTheme,
      intensity: 0.35,
    })
  })

  it("グレインはダイヤルで調整できる", async () => {
    const { connection, picker } = await openPicker(tunedTheme)
    const dial = within(picker).getByRole("slider", { name: "グレイン" })

    await fireEvent.keyDown(dial, { key: "End" })
    await fireEvent.keyUp(dial, { key: "End" })

    expect(sentThemes(connection.sentCommands).at(-1)).toStrictEqual({ ...tunedTheme, grain: 1 })
  })

  it("モードを選ぶとそのモードのテーマを送る", async () => {
    const { connection, picker } = await openPicker(tunedTheme)

    await fireEvent.click(within(picker).getByRole("radio", { name: "ライト" }))

    expect(sentThemes(connection.sentCommands)).toStrictEqual([{ ...tunedTheme, mode: "light" }])
  })
})

describe("プリセット", () => {
  it("選ぶと色だけが変わり、モード・強さ・グレインはそのまま保つ", async () => {
    const { connection, picker } = await openPicker(tunedTheme)

    await fireEvent.click(within(picker).getByRole("button", { name: "単色 2" }))

    expect(sentThemes(connection.sentCommands)).toStrictEqual([
      { ...tunedTheme, colors: presetPages[0]?.[1] },
    ])
  })

  it("次のページにはグラデーションのプリセットが並ぶ", async () => {
    const { connection, picker } = await openPicker(tunedTheme)

    await fireEvent.click(within(picker).getByRole("button", { name: "次のプリセット" }))
    await fireEvent.click(within(picker).getByRole("button", { name: "グラデーション 1" }))

    expect(sentThemes(connection.sentCommands).at(-1)?.colors).toStrictEqual(presetPages[1]?.[0])
  })

  it("最初のページでは前へ、最後のページでは次へ進めない", async () => {
    const { picker } = await openPicker(tunedTheme)
    const button = (name: string) => within(picker).getByRole<HTMLButtonElement>("button", { name })
    const canGoBackOnFirst = !button("前のプリセット").disabled

    await fireEvent.click(button("次のプリセット"))

    expect([canGoBackOnFirst, button("次のプリセット").disabled]).toStrictEqual([false, true])
  })
})

describe("ピッカーを閉じる", () => {
  it("Escape で閉じる", async () => {
    await openPicker(tunedTheme)

    await fireEvent.keyDown(window, { key: "Escape" })

    expect(screen.queryByRole("dialog", { name: "テーマ" })).toBeNull()
  })

  it("ピッカーの外側を押すと閉じる", async () => {
    await openPicker(tunedTheme)

    await fireEvent.pointerDown(screen.getByRole("main"))

    expect(screen.queryByRole("dialog", { name: "テーマ" })).toBeNull()
  })

  it("閉じたあとも、新しいテーマがビューに届くまでは選んだテーマで塗り続ける", async () => {
    const { container, picker } = await openPicker(tunedTheme)
    await fireEvent.click(within(picker).getByRole("radio", { name: "ライト" }))

    await fireEvent.keyDown(window, { key: "Escape" })

    expect(shownAppearance(container).scheme).toBe("light")
  })

  it("新しいテーマがビューに届いたあとは、ビューのテーマで塗る", async () => {
    const { container, picker, pushView } = await openPicker(tunedTheme)
    await fireEvent.click(within(picker).getByRole("radio", { name: "ライト" }))
    await fireEvent.keyDown(window, { key: "Escape" })
    const saved = { ...tunedTheme, mode: "light" as const }
    await pushView(sidebarView({ spaces: [spaceView("work", { theme: saved })] }))

    await pushView(sidebarView({ spaces: [spaceView("work", { theme: tunedTheme })] }))

    expect(shownAppearance(container).scheme).toBe("dark")
  })
})
