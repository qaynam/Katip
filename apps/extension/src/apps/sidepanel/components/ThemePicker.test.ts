import { fireEvent, screen, within } from "@testing-library/svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SpaceName } from "#modules/space"
import {
  appearanceOf,
  applyPreset,
  colorAtPoint,
  MAX_THEME_COLORS,
  moveColor,
  neutralTheme,
  presetPages,
  type SpaceTheme,
  type ThemePreset,
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
  texture: "lines",
}

const openPicker = async (theme: SpaceTheme) => {
  const rendered = await renderSidebar(
    sidebarView({ spaces: [spaceView("work", { name: SpaceName.make("Work"), theme })] }),
  )
  await fireEvent.click(screen.getByRole("button", { name: "Space menu" }))
  await fireEvent.click(screen.getByRole("menuitem", { name: "Edit Theme" }))
  return { ...rendered, picker: screen.getByRole("dialog", { name: "Theme" }) }
}

const sentThemes = (commands: ReadonlyArray<SidebarCommand>) =>
  commandsOf(commands, "SetSpaceTheme").map((command) =>
    command._tag === "SetSpaceTheme" ? command.theme : null,
  )

// jsdom has no layout, so the color field is given a size
const fieldOf = (picker: HTMLElement) => {
  const field = within(picker).getByRole("group", { name: "Colors" })
  vi.spyOn(field, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 300, height: 268 }),
  )
  return field
}
const fieldCenter = { x: 150, y: 134 }
/** How far from the center dots go in each direction, where the most vivid colors are. */
const reach = { x: fieldCenter.x - FIELD_EDGE_INSET_PX, y: fieldCenter.y - FIELD_EDGE_INSET_PX }

describe("The picker before a color is chosen", () => {
  it("explains how to choose a color and hides the intensity thumb and the grain ticks", async () => {
    const { picker } = await openPicker(neutralTheme)

    expect(within(picker).getByText("Click to choose a color for this Space")).toBeTruthy()
    expect(picker.querySelector("[data-thumb]")).toBeNull()
    expect(picker.querySelector("[data-tick]")).toBeNull()
    expect(within(picker).getByRole("slider", { name: "Color intensity" }).ariaDisabled).toBe(
      "true",
    )
  })

  it("can't change the texture until there is a color to lay it over", async () => {
    const { picker } = await openPicker(neutralTheme)

    expect(
      within(picker).getByRole<HTMLButtonElement>("button", { name: "Texture: Grain" }).disabled,
    ).toBe(true)
  })

  it("can neither add nor remove colors", async () => {
    const { picker } = await openPicker(neutralTheme)

    const buttons = ["Remove a color", "Add a color"].map(
      (name) => within(picker).getByRole<HTMLButtonElement>("button", { name }).disabled,
    )

    expect(buttons).toStrictEqual([true, true])
  })

  it("sends a theme whose primary color is the one at the pressed position in the field", async () => {
    const { connection, picker } = await openPicker(neutralTheme)
    const field = fieldOf(picker)
    const at = { clientX: fieldCenter.x + reach.x, clientY: fieldCenter.y, pointerId: 1 }

    await fireEvent.pointerDown(field, at)
    await fireEvent.pointerUp(field, at)

    expect(sentThemes(connection.sentCommands).at(-1)).toStrictEqual({
      ...neutralTheme,
      colors: [colorAtPoint({ x: 1, y: 0 })],
    })
  })

  it("picks the most vivid color at the center of the field", async () => {
    const { connection, picker } = await openPicker(neutralTheme)
    const field = fieldOf(picker)
    const at = { clientX: fieldCenter.x, clientY: fieldCenter.y, pointerId: 1 }

    await fireEvent.pointerDown(field, at)
    await fireEvent.pointerUp(field, at)

    expect(sentThemes(connection.sentCommands).at(-1)?.colors[0]?.chroma).toBe(1)
  })

  it("picks the palest color in a corner of the field, as at its sides", async () => {
    const { connection, picker } = await openPicker(neutralTheme)
    const field = fieldOf(picker)
    const at = {
      clientX: fieldCenter.x - reach.x,
      clientY: fieldCenter.y - reach.y,
      pointerId: 1,
    }

    await fireEvent.pointerDown(field, at)
    await fireEvent.pointerUp(field, at)

    expect(sentThemes(connection.sentCommands).at(-1)?.colors[0]?.chroma).toBeCloseTo(0)
  })
})

describe("The picker after a color is chosen", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows the intensity thumb and the grain ticks", async () => {
    const { picker } = await openPicker(tunedTheme)

    expect(picker.querySelector("[data-thumb]")).not.toBeNull()
    expect(picker.querySelector("[data-tick]")).not.toBeNull()
  })

  it("throttles sending while dragging and always sends the color at the final position on release", async () => {
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
    await fireEvent.pointerUp(field, pointerAt(reach.y / 2))

    expect(sentThemes(connection.sentCommands).map((theme) => theme?.colors)).toStrictEqual([
      [colorAtPoint({ x: 0, y: 10 / reach.y })],
      [colorAtPoint({ x: 0, y: 0.5 })],
    ])
  })

  it("paints the whole sidebar in the dragged color without waiting for the background", async () => {
    const { container, picker } = await openPicker(tunedTheme)
    const field = fieldOf(picker)

    await fireEvent.pointerDown(field, {
      clientX: fieldCenter.x,
      clientY: fieldCenter.y + reach.y,
      pointerId: 1,
    })

    const dragged = { ...tunedTheme, colors: [colorAtPoint({ x: 0, y: -1 })] }
    expect(shownAppearance(container).background).toBe(appearanceOf(dragged, "light").background)
  })

  it("drags every color together when one of them is dragged", async () => {
    const harmony = [yellow, { hue: 130, chroma: 0.8 }, { hue: 50, chroma: 0.8 }]
    const { connection, picker } = await openPicker({ ...tunedTheme, colors: harmony })
    const field = fieldOf(picker)
    const second = within(picker).getByRole("button", { name: "Color 2" })
    const at = { clientX: fieldCenter.x, clientY: fieldCenter.y - reach.y / 2, pointerId: 1 }

    await fireEvent.pointerDown(second, at)
    await fireEvent.pointerUp(field, at)

    expect(sentThemes(connection.sentCommands).at(-1)?.colors).toStrictEqual(
      moveColor(harmony, 1, colorAtPoint({ x: 0, y: 0.5 })),
    )
  })

  it("moves the color dot with the arrow keys", async () => {
    const { connection, picker } = await openPicker({
      ...tunedTheme,
      colors: [{ hue: 0, chroma: 1 }],
    })
    const primary = within(picker).getByRole("button", { name: "Primary color" })

    await fireEvent.keyDown(primary, { key: "ArrowUp" })
    await fireEvent.keyUp(primary, { key: "ArrowUp" })

    expect(sentThemes(connection.sentCommands).at(-1)?.colors).toStrictEqual([
      colorAtPoint({ x: 0, y: 0.05 }),
    ])
  })

  it("adds a color for a gradient with + and removes the last added one with −", async () => {
    const { connection, picker } = await openPicker(tunedTheme)

    await fireEvent.click(within(picker).getByRole("button", { name: "Add a color" }))
    await fireEvent.click(within(picker).getByRole("button", { name: "Remove a color" }))

    expect(sentThemes(connection.sentCommands).map((theme) => theme?.colors.length)).toStrictEqual([
      2, 1,
    ])
  })

  it("can't remove the only color or add beyond the color limit", async () => {
    const { picker: single, unmount } = await openPicker(tunedTheme)
    const canRemoveFromSingle = !within(single).getByRole<HTMLButtonElement>("button", {
      name: "Remove a color",
    }).disabled
    unmount()

    const { picker: full } = await openPicker({
      ...tunedTheme,
      colors: [yellow, red, { hue: 140, chroma: 0.7 }].slice(0, MAX_THEME_COLORS),
    })
    const canAddToFull = !within(full).getByRole<HTMLButtonElement>("button", {
      name: "Add a color",
    }).disabled

    expect([canRemoveFromSingle, canAddToFull]).toStrictEqual([false, false])
  })

  it("adjusts the intensity with the keyboard and sends it when the key is released", async () => {
    const { connection, picker } = await openPicker(tunedTheme)
    const slider = within(picker).getByRole("slider", { name: "Color intensity" })

    await fireEvent.keyDown(slider, { key: "ArrowRight" })
    await fireEvent.keyUp(slider, { key: "ArrowRight" })

    expect(sentThemes(connection.sentCommands).at(-1)).toStrictEqual({
      ...tunedTheme,
      intensity: 0.35,
    })
  })

  it("adjusts the grain with the dial", async () => {
    const { connection, picker } = await openPicker(tunedTheme)
    const dial = within(picker).getByRole("slider", { name: "Grain" })

    await fireEvent.keyDown(dial, { key: "End" })
    await fireEvent.keyUp(dial, { key: "End" })

    expect(sentThemes(connection.sentCommands).at(-1)).toStrictEqual({ ...tunedTheme, grain: 1 })
  })

  it("changes the texture when the middle of the dial is pressed, going round to the first after the last", async () => {
    const { connection, picker } = await openPicker({ ...tunedTheme, texture: "linen" })

    await fireEvent.click(within(picker).getByRole("button", { name: "Texture: Linen" }))
    await fireEvent.click(within(picker).getByRole("button", { name: "Texture: Paper" }))

    expect(sentThemes(connection.sentCommands).map((theme) => theme?.texture)).toStrictEqual([
      "paper",
      "grain",
    ])
  })

  it("sends the theme in the chosen mode", async () => {
    const { connection, picker } = await openPicker(tunedTheme)

    await fireEvent.click(within(picker).getByRole("radio", { name: "Light" }))

    expect(sentThemes(connection.sentCommands)).toStrictEqual([{ ...tunedTheme, mode: "light" }])
  })
})

const presetAt = (page: number, index: number): ThemePreset => {
  const preset = presetPages[page]?.[index]
  if (preset === undefined) throw new Error(`No preset ${index} on page ${page}`)
  return preset
}

describe("Presets", () => {
  it("changes only the colors when a color preset is chosen, keeping the mode, intensity, and grain", async () => {
    const { connection, picker } = await openPicker(tunedTheme)

    await fireEvent.click(within(picker).getByRole("button", { name: "Solid 2" }))

    expect(sentThemes(connection.sentCommands)).toStrictEqual([
      applyPreset(tunedTheme, presetAt(0, 1)),
    ])
  })

  it("lists gradient presets on the next page", async () => {
    const { connection, picker } = await openPicker(tunedTheme)

    await fireEvent.click(within(picker).getByRole("button", { name: "Next presets" }))
    await fireEvent.click(within(picker).getByRole("button", { name: "Gradient 1" }))

    expect(sentThemes(connection.sentCommands).at(-1)).toStrictEqual(
      applyPreset(tunedTheme, presetAt(1, 0)),
    )
  })

  it("lists grays on the last page, which set the scheme and intensity too", async () => {
    const { connection, picker } = await openPicker(tunedTheme)
    const next = within(picker).getByRole("button", { name: "Next presets" })

    await fireEvent.click(next)
    await fireEvent.click(next)
    await fireEvent.click(within(picker).getByRole("button", { name: "Gray 1" }))

    expect(sentThemes(connection.sentCommands).at(-1)).toStrictEqual(
      applyPreset(tunedTheme, presetAt(2, 0)),
    )
  })

  it("can't go back from the first page or forward from the last", async () => {
    const { picker } = await openPicker(tunedTheme)
    const button = (name: string) => within(picker).getByRole<HTMLButtonElement>("button", { name })
    const canGoBackOnFirst = !button("Previous presets").disabled

    for (let page = 1; page < presetPages.length; page += 1) {
      await fireEvent.click(button("Next presets"))
    }

    expect([canGoBackOnFirst, button("Next presets").disabled]).toStrictEqual([false, true])
  })
})

describe("Closing the picker", () => {
  it("closes with Escape", async () => {
    await openPicker(tunedTheme)

    await fireEvent.keyDown(window, { key: "Escape" })

    expect(screen.queryByRole("dialog", { name: "Theme" })).toBeNull()
  })

  it("closes when pressing outside the picker", async () => {
    await openPicker(tunedTheme)

    await fireEvent.pointerDown(screen.getByRole("main"))

    expect(screen.queryByRole("dialog", { name: "Theme" })).toBeNull()
  })

  it("keeps painting the chosen theme after closing until the new theme reaches the view", async () => {
    const { container, picker } = await openPicker(tunedTheme)
    await fireEvent.click(within(picker).getByRole("radio", { name: "Light" }))

    await fireEvent.keyDown(window, { key: "Escape" })

    expect(shownAppearance(container).scheme).toBe("light")
  })

  it("paints the view's theme once the new theme has reached the view", async () => {
    const { container, picker, pushView } = await openPicker(tunedTheme)
    await fireEvent.click(within(picker).getByRole("radio", { name: "Light" }))
    await fireEvent.keyDown(window, { key: "Escape" })
    const saved = { ...tunedTheme, mode: "light" as const }
    await pushView(sidebarView({ spaces: [spaceView("work", { theme: saved })] }))

    await pushView(sidebarView({ spaces: [spaceView("work", { theme: tunedTheme })] }))

    expect(shownAppearance(container).scheme).toBe("dark")
  })
})
