import { describe, expect, it } from "vitest"
import { SpaceId, SpaceName } from "#modules/space"
import { neutralTheme, swatchOf, themeOf } from "#modules/theme"
import { BookmarkId, TabId } from "#platform/browser"
import type { SpotlightResult } from "#protocol"
import { makeTranslator } from "#modules/i18n"
import { displayOf, isMatchedCandidate } from "./result-display"

const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000

const display = (result: SpotlightResult) => displayOf(result, NOW, makeTranslator("en"))

const openTab = (
  overrides: Partial<Extract<SpotlightResult, { _tag: "OpenTab" }>> = {},
): SpotlightResult => ({
  _tag: "OpenTab",
  tabId: TabId.make(1),
  title: "Design doc",
  url: "https://www.docs.example/design/",
  favIconUrl: null,
  spaceName: SpaceName.make("Work"),
  isFavorite: false,
  isInOtherWindow: false,
  ...overrides,
})

const pin = (
  overrides: Partial<Extract<SpotlightResult, { _tag: "Pin" }>> = {},
): SpotlightResult => ({
  _tag: "Pin",
  bookmarkId: BookmarkId.make("10"),
  title: "Mail",
  url: "https://mail.example/",
  spaceName: SpaceName.make("Work"),
  folderPath: [],
  isSplit: false,
  ...overrides,
})

describe("an open tab's display", () => {
  it("details the tab's Space and URL", () => {
    expect(display(openTab()).detail).toBe("Work · docs.example/design")
  })

  it("details a Favorites tab as Favorites", () => {
    expect(display(openTab({ isFavorite: true, spaceName: null })).detail).toBe(
      "Favorites · docs.example/design",
    )
  })

  it("details a tab in no Space as such", () => {
    expect(display(openTab({ spaceName: null })).detail).toBe(
      "Not in a Space · docs.example/design",
    )
  })

  it("details a tab in another window as such", () => {
    expect(display(openTab({ isInOtherWindow: true })).detail).toBe(
      "Work · In another window · docs.example/design",
    )
  })

  it("is of the tab kind", () => {
    expect(display(openTab()).kindLabel).toBe("Tab")
  })
})

describe("a closed pin's display", () => {
  it("details the folders from the Space down, and the URL", () => {
    expect(display(pin({ folderPath: ["Contacts", "External"] })).detail).toBe(
      "Work › Contacts › External · mail.example",
    )
  })

  it("details a split view pin as a split view in place of the URL", () => {
    expect(display(pin({ isSplit: true })).detail).toBe("Work · Split View")
  })
})

describe("a Space's display", () => {
  const space = (
    isActive: boolean,
    theme = themeOf([{ hue: 200, chroma: 0.5 }]),
  ): SpotlightResult => ({
    _tag: "Space",
    spaceId: SpaceId.make("work"),
    name: SpaceName.make("Work"),
    theme,
    isActive,
  })

  it("details the current Space as current", () => {
    expect(display(space(true)).detail).toBe("Current Space")
  })

  it("details another Space as one to switch to", () => {
    expect(display(space(false)).detail).toBe("Switch to this Space")
  })

  it("shows a swatch of the theme's main color as the icon", () => {
    expect(display(space(false)).icon).toStrictEqual({
      _tag: "Swatch",
      color: swatchOf({ hue: 200, chroma: 0.5 }),
    })
  })

  it("shows a gray swatch for a theme without color", () => {
    expect(display(space(false, neutralTheme)).icon).toStrictEqual({
      _tag: "Swatch",
      color: swatchOf({ hue: 0, chroma: 0 }),
    })
  })
})

describe("a bookmark's display", () => {
  it("takes the URL as the title of a bookmark without a name", () => {
    const shown = display({
      _tag: "Bookmark",
      bookmarkId: BookmarkId.make("20"),
      title: " ",
      url: "https://effect.website/",
    })

    expect(shown.title).toBe("effect.website")
  })
})

describe("a history page's display", () => {
  const history = (title: string, daysAgo: number): SpotlightResult => ({
    _tag: "History",
    title,
    url: "https://www.blog.example/posts/1/",
    lastVisitedAt: NOW - daysAgo * DAY,
  })

  it("details the URL and how long ago it was last visited", () => {
    expect(display(history("Post", 3)).detail).toBe("blog.example/posts/1 · 3 days ago")
  })

  it("takes the URL as the title of a page without a name", () => {
    expect(display(history("", 1)).title).toBe("blog.example/posts/1")
  })

  it("is of the history kind", () => {
    expect(display(history("Post", 1)).kindLabel).toBe("History")
  })
})

describe("a command's display", () => {
  const command = (shortcut: string | null): SpotlightResult => ({
    _tag: "Action",
    action: { _tag: "CopyUrl" },
    title: "Copy URL",
    shortcut,
  })

  it("has the assigned keys", () => {
    expect(display(command("⇧⌘C")).shortcut).toBe("⇧⌘C")
  })

  it("has no keys when none are assigned", () => {
    expect(display(command(null)).shortcut).toBeNull()
  })

  it("shows the command icon and is of the command kind", () => {
    const shown = display(command(null))

    expect([shown.icon, shown.kindLabel]).toStrictEqual([{ _tag: "Command" }, "Command"])
  })

  it("is the only kind of display that has keys", () => {
    expect(display(openTab()).shortcut).toBeNull()
  })
})

describe("opening a URL and searching the web", () => {
  it("opening a URL takes the URL as the title and is of the open kind", () => {
    const shown = display({ _tag: "OpenUrl", url: "https://example.com" })

    expect([shown.title, shown.kindLabel]).toStrictEqual(["https://example.com", "Open"])
  })

  it("searching the web takes the query as the title and is of the web search kind", () => {
    const shown = display({ _tag: "SearchWeb", query: "katip" })

    expect([shown.title, shown.kindLabel]).toStrictEqual(["katip", "Web Search"])
  })

  it("don't count as results that matched the query", () => {
    expect(
      [
        { _tag: "OpenUrl", url: "https://example.com" } as const,
        { _tag: "SearchWeb", query: "katip" } as const,
        openTab(),
      ].map(isMatchedCandidate),
    ).toStrictEqual([false, false, true])
  })
})

describe("the display language", () => {
  it("is the language of the detail and the kind", () => {
    const shown = displayOf(openTab({ spaceName: null }), NOW, makeTranslator("ja"))

    expect([shown.detail, shown.kindLabel]).toStrictEqual([
      "Space に属さないタブ · docs.example/design",
      "タブ",
    ])
  })

  it("leaves the title from the background untranslated", () => {
    const shown = displayOf(openTab(), NOW, makeTranslator("ja"))

    expect(shown.title).toBe("Design doc")
  })
})
