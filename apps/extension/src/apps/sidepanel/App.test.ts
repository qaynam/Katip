import { fireEvent, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { appearanceOf, themeOf, type SpaceTheme } from "#modules/theme"
import { renderSidebar, shownAppearance } from "./testing/render-sidebar"
import { sidebarView, spaceView, tabView } from "./testing/view-builders"

const yellow = themeOf([{ hue: 90, chroma: 0.8 }])
const lightYellow: SpaceTheme = { ...yellow, mode: "light" }
const darkYellow: SpaceTheme = { ...yellow, mode: "dark" }

const viewWithTheme = (theme: SpaceTheme) =>
  sidebarView({ spaces: [spaceView("work", { theme }), spaceView("hobby")] })

const emulateSystemScheme = (scheme: "light" | "dark") =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: scheme === "dark" && query.includes("dark"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))

describe("The sidebar", () => {
  it("shows that it is loading until the view arrives", async () => {
    await renderSidebar(null)

    expect(screen.getByText("Loading the sidebar…")).toBeTruthy()
  })

  it("shows notices from the background as toasts", async () => {
    const { connection } = await renderSidebar(sidebarView())

    connection.pushNotice("Archived the tab")
    await tick()

    expect(screen.getByRole("status").textContent).toContain("Archived the tab")
  })

  it("shows the reason in a toast when a command fails", async () => {
    await renderSidebar(
      sidebarView({ spaces: [spaceView("work", { temporaryTabs: [tabView(1)] })] }),
      {
        respond: () => ({ outcome: { _tag: "Failed", reason: "Tab not found" } }),
      },
    )

    await fireEvent.click(screen.getByRole("button", { name: "Tab 1" }))
    await tick()

    expect(screen.getByRole("status").textContent).toContain("Tab not found")
  })

  it("opens a new tab in this window from the New Tab button", async () => {
    const { connection } = await renderSidebar(sidebarView())

    await fireEvent.click(screen.getByRole("button", { name: "New Tab" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "OpenNewTab", windowId: 1 }])
  })

  it("opens Spotlight in this window from the Search button at the top", async () => {
    const { connection } = await renderSidebar(sidebarView())

    await fireEvent.click(screen.getByRole("button", { name: "Search" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "OpenSpotlight", windowId: 1 }])
  })

  it("shows on the Search button the key the browser assigned to Spotlight", async () => {
    await renderSidebar(sidebarView({ spotlightShortcut: "⌥T" }))

    expect(screen.getByRole("button", { name: "Search" }).textContent).toContain("⌥T")
  })

  it("shows no key on the Search button while none is assigned", async () => {
    await renderSidebar(sidebarView({ spotlightShortcut: null }))

    const button = screen.getByRole("button", { name: "Search" })
    expect([button.querySelector("kbd"), button.getAttribute("aria-keyshortcuts")]).toStrictEqual([
      null,
      null,
    ])
  })

  it("announces a key written with modifier names, such as Alt+T", async () => {
    await renderSidebar(sidebarView({ spotlightShortcut: "Alt+T" }))

    expect(screen.getByRole("button", { name: "Search" }).getAttribute("aria-keyshortcuts")).toBe(
      "Alt+T",
    )
  })
})

describe("Space themes", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("paints dark text for a theme with a light background", async () => {
    const { container } = await renderSidebar(viewWithTheme(lightYellow))

    const shown = shownAppearance(container)

    expect(shown.text).toBe(appearanceOf(lightYellow, "light").text)
    expect(shown.text).toMatch(/^rgb\(28 28 31/)
  })

  it("paints white text for a theme with a dark background", async () => {
    const { container } = await renderSidebar(viewWithTheme(darkYellow))

    expect(shownAppearance(container).text).toMatch(/^rgb\(255 255 255/)
  })

  it("paints the whole sidebar with the background of the active Space's theme", async () => {
    const { container } = await renderSidebar(viewWithTheme(lightYellow))

    expect(shownAppearance(container).background).toBe(
      appearanceOf(lightYellow, "light").background,
    )
  })

  it("uses a gradient background for a theme with two or more colors", async () => {
    const gradient = themeOf([
      { hue: 90, chroma: 0.8 },
      { hue: 25, chroma: 0.8 },
    ])

    const { container } = await renderSidebar(viewWithTheme(gradient))

    expect(shownAppearance(container).background).toMatch(/^linear-gradient\(/)
  })

  it("paints a theme in auto mode dark when the OS is dark", async () => {
    emulateSystemScheme("dark")

    const { container } = await renderSidebar(viewWithTheme(yellow))

    expect(shownAppearance(container).scheme).toBe("dark")
  })

  it("paints with the new Space's theme after switching Spaces", async () => {
    const { container, pushView } = await renderSidebar(viewWithTheme(lightYellow))
    const view = viewWithTheme(lightYellow)

    await pushView({ ...view, activeSpaceId: view.spaces[1]?.id ?? view.activeSpaceId })

    expect(shownAppearance(container).background).toBe(
      appearanceOf(view.spaces[1]?.theme ?? lightYellow, "light").background,
    )
  })
})
