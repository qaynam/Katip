import { fireEvent, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { appearanceOf, themeOf, type SpaceTheme } from "#modules/theme"
import { TabId } from "#platform/browser"
import { renderSidebar, shownAppearance } from "./testing/render-sidebar"
import { favoriteView, sidebarView, spaceView, tabView } from "./testing/view-builders"

const yellow = themeOf([{ hue: 90, chroma: 0.8 }])
const lightYellow: SpaceTheme = { ...yellow, mode: "light" }
const darkYellow: SpaceTheme = { ...yellow, mode: "dark" }

const viewWithTheme = (theme: SpaceTheme) =>
  sidebarView({ spaces: [spaceView("work", { theme }), spaceView("hobby")] })

const searchField = () => screen.getByRole("button", { name: "Open Command Palette" })

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

  it("opens the Command Palette in this window from the search field at the top", async () => {
    const { connection } = await renderSidebar(sidebarView())

    await fireEvent.click(searchField())

    expect(connection.sentCommands).toStrictEqual([{ _tag: "OpenSpotlight", windowId: 1 }])
  })

  it("shows in the search field the key the browser assigned to the Command Palette", async () => {
    await renderSidebar(sidebarView({ spotlightShortcut: "⌥T" }))

    expect(searchField().textContent).toContain("⌥T")
  })

  it("shows no key in the search field while none is assigned", async () => {
    await renderSidebar(sidebarView({ spotlightShortcut: null }))

    const button = searchField()
    expect([button.querySelector("kbd"), button.getAttribute("aria-keyshortcuts")]).toStrictEqual([
      null,
      null,
    ])
  })

  it("announces a key written with modifier names, such as Alt+T", async () => {
    await renderSidebar(sidebarView({ spotlightShortcut: "Alt+T" }))

    expect(searchField().getAttribute("aria-keyshortcuts")).toBe("Alt+T")
  })
})

describe("The search field at the top", () => {
  const withActiveTabAt = (url: string) =>
    sidebarView({
      spotlightShortcut: null,
      spaces: [spaceView("work", { temporaryTabs: [tabView(1, { url, isActive: true })] })],
    })

  it("shows the active tab's host without www, and describes the field with it", async () => {
    await renderSidebar(withActiveTabAt("https://www.github.com/qaynam/katip/pulls?q=is%3Aopen"))

    expect(searchField().textContent?.trim()).toBe("github.com")
    expect(
      screen.getByRole("button", { name: "Open Command Palette", description: "github.com" }),
    ).toBeTruthy()
  })

  it("shows the host of a Favorite that is the active tab", async () => {
    await renderSidebar(
      sidebarView({
        spotlightShortcut: null,
        favorites: [
          favoriteView(5, {
            url: "https://mail.google.com/mail/u/0/#inbox",
            openTab: { tabId: TabId.make(5), isActive: true },
          }),
        ],
      }),
    )

    expect(searchField().textContent?.trim()).toBe("mail.google.com")
  })

  it.each([
    ["a new tab page", "chrome://newtab/"],
    ["one of the browser's own pages", "chrome://settings/"],
    ["an extension's page", "chrome-extension://abcdefghijklmnop/page.html"],
    ["a tab with no URL yet", ""],
  ])("shows Search instead of a URL for %s", async (_, url) => {
    await renderSidebar(withActiveTabAt(url))

    expect([
      searchField().textContent?.trim(),
      searchField().getAttribute("aria-describedby"),
    ]).toStrictEqual(["Search", null])
  })

  it("shows Search while the sidebar shows no active tab", async () => {
    await renderSidebar(sidebarView({ spotlightShortcut: null }))

    expect(searchField().textContent?.trim()).toBe("Search")
  })

  it("follows the tab the window switches to", async () => {
    const { pushView } = await renderSidebar(withActiveTabAt("https://example.com/"))

    await pushView(withActiveTabAt("https://developer.mozilla.org/en-US/"))

    expect(searchField().textContent?.trim()).toBe("developer.mozilla.org")
  })

  it("opens the Command Palette when a URL is shown in it, as when it says Search", async () => {
    const { connection } = await renderSidebar(withActiveTabAt("https://github.com/"))

    await fireEvent.click(searchField())

    expect(connection.sentCommands).toStrictEqual([{ _tag: "OpenSpotlight", windowId: 1 }])
  })
})

describe("Closing the side panel", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("closes the side panel of this window from the Close Sidebar button at the top", async () => {
    const { sidePanel } = await renderSidebar(sidebarView())

    await fireEvent.click(screen.getByRole("button", { name: "Close Sidebar" }))

    expect(sidePanel.closedIn).toStrictEqual([1])
  })

  it("names the close button in a tooltip once the pointer rests on it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    await renderSidebar(sidebarView())

    await fireEvent.pointerEnter(screen.getByRole("button", { name: "Close Sidebar" }), {
      clientX: 220,
      clientY: 20,
    })
    vi.advanceTimersByTime(1_000)
    await tick()

    expect(screen.getByRole("tooltip").textContent).toContain("Close Sidebar")
  })

  it("names the close button in the display language", async () => {
    await renderSidebar(sidebarView(), { locale: "ja" })

    expect(screen.getByRole("button", { name: "サイドバーを閉じる" })).toBeTruthy()
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
