import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte"
import { tick } from "svelte"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type Locale, makeTranslator } from "#modules/i18n"
import { SpaceName } from "#modules/space"
import type { SpotlightSize } from "#modules/spotlight"
import { TabId } from "#platform/browser"
import type { SpotlightMode, SpotlightResult } from "#protocol"
import App from "./App.svelte"
import { createFakeConnection, type FakeConnectionOptions } from "./testing/fake-connection"

// jsdom has no layout and doesn't implement scrollIntoView
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const tab = (id: number, title: string): SpotlightResult => ({
  _tag: "OpenTab",
  tabId: TabId.make(id),
  title,
  url: `https://example.com/${id}`,
  favIconUrl: null,
  spaceName: SpaceName.make("Work"),
  isFavorite: false,
  isInOtherWindow: false,
})

const webSearch = (query: string): SpotlightResult => ({ _tag: "SearchWeb", query })

const command = (title: string, shortcut: string | null): SpotlightResult => ({
  _tag: "Action",
  action: { _tag: "CopyUrl" },
  title,
  shortcut,
})

const DAY = 24 * 60 * 60 * 1000

const historyPage = (title: string, daysAgo: number): SpotlightResult => ({
  _tag: "History",
  title,
  url: "https://blog.example/posts/1",
  lastVisitedAt: Date.now() - daysAgo * DAY,
})

const commands = [command("Copy URL", "⇧⌘C"), command("Duplicate tab", null)]

const respondByMode = (query: string, mode: SpotlightMode) =>
  mode === "Actions" ? commands : query === "" ? threeTabs : [webSearch(query)]

const threeTabs = [tab(1, "Mail"), tab(2, "Calendar"), tab(3, "Docs")]

const renderSpotlight = (
  options: FakeConnectionOptions = {},
  locale: Locale = "en",
  size: SpotlightSize = "Normal",
) => {
  const connection = createFakeConnection(options)
  const close = vi.fn()
  const setCollapsed = vi.fn<(collapsed: boolean) => void>()
  render(App, {
    props: {
      connection,
      faviconUrl: () => null,
      close,
      translator: makeTranslator(locale),
      size,
      setCollapsed,
    },
  })
  return { connection, close, setCollapsed, input: screen.getByRole("combobox") }
}

const optionNames = () => screen.getAllByRole("option").map((option) => option.textContent ?? "")

const selectedOption = () =>
  screen.getAllByRole("option").find((option) => option.getAttribute("aria-selected") === "true")

const type = (input: HTMLElement, value: string) => fireEvent.input(input, { target: { value } })

/** Lets the delivered responses be handled and the page render them. */
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await tick()
}

describe("a compact Spotlight", () => {
  it("shows the search field alone until something is typed, then opens out to the results", async () => {
    const { connection, setCollapsed, input } = renderSpotlight({}, "en", "Compact")
    await connection.answer("", threeTabs)
    await settle()
    const whileEmpty = [screen.queryAllByRole("option").length, setCollapsed.mock.lastCall]

    type(input, "Mail")
    await connection.answer("Mail", [tab(1, "Mail")])
    await settle()

    expect([
      whileEmpty,
      [screen.queryAllByRole("option").length, setCollapsed.mock.lastCall],
    ]).toStrictEqual([
      [0, [true]],
      [1, [false]],
    ])
  })

  it("opens out for the commands, asked for with Tab", async () => {
    const { connection, setCollapsed, input } = renderSpotlight({}, "en", "Compact")
    await connection.answer("", threeTabs)
    await settle()

    await fireEvent.keyDown(input, { key: "Tab" })

    expect(setCollapsed.mock.lastCall).toStrictEqual([false])
  })

  it("opens nothing on Enter while it shows the search field alone", async () => {
    const { connection, close, input } = renderSpotlight({}, "en", "Compact")
    await connection.answer("", threeTabs)
    await settle()

    await fireEvent.keyDown(input, { key: "ArrowDown" })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect([connection.chosen, close.mock.calls.length]).toStrictEqual([[], 0])
  })

  it("never collapses at the normal size", async () => {
    const { connection, setCollapsed } = renderSpotlight()
    await connection.answer("", threeTabs)
    await settle()

    expect([screen.getAllByRole("option").length, setCollapsed.mock.calls]).toStrictEqual([3, []])
  })
})

describe("on opening", () => {
  it("searches with an empty query and shows loading until the response arrives", () => {
    const { connection } = renderSpotlight()

    expect(connection.searches).toStrictEqual([{ query: "", mode: "All" }])
    expect(screen.getByRole("status").textContent).toBe("Loading…")
  })

  it("lists the results once the response arrives, with the first one selected", async () => {
    const { connection } = renderSpotlight()

    await connection.answer("", threeTabs)

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))
    expect(selectedOption()?.textContent).toContain("Mail")
  })

  it("has the search field focused", () => {
    const { input } = renderSpotlight()

    expect(document.activeElement).toBe(input)
  })
})

describe("typing", () => {
  it("searches with the query on every input", async () => {
    const { connection, input } = renderSpotlight({ respond: () => [] })

    await type(input, "k")
    await type(input, "ka")

    expect(connection.searches.map(({ query }) => query)).toStrictEqual(["", "k", "ka"])
  })

  it("keeps showing the latest input's results when an older input's response arrives later", async () => {
    const { connection, input } = renderSpotlight()
    await connection.answer("", [])
    await type(input, "m")
    await type(input, "ma")

    await connection.answer("ma", [tab(1, "Mail")])
    await connection.answer("m", [tab(1, "Mail"), tab(4, "Memo")])
    await settle()

    expect(optionNames()).toHaveLength(1)
    expect(optionNames()[0]).toContain("Mail")
  })

  it("says nothing matched when nothing does, and still lists the web search", async () => {
    const { input } = renderSpotlight({
      respond: (query) => (query === "" ? [] : [webSearch(query)]),
    })

    await type(input, "zzz")

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("No matches"))
    expect(optionNames()).toHaveLength(1)
  })

  it("with an empty query and nothing to list, says there are no recent tabs", async () => {
    renderSpotlight({ respond: () => [] })

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("No recent tabs"))
  })

  it("when the background can't be reached, says it couldn't connect", async () => {
    const { connection } = renderSpotlight()

    await connection.answer("", [], { unreachable: true })

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Couldn’t connect to Katip"),
    )
  })
})

describe("choosing with the keyboard", () => {
  it("↓ selects the next result and ↑ the previous one", async () => {
    const { input } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "ArrowDown" })
    await fireEvent.keyDown(input, { key: "ArrowDown" })
    await fireEvent.keyDown(input, { key: "ArrowUp" })

    expect(selectedOption()?.textContent).toContain("Calendar")
  })

  it("Ctrl+N selects the next result and Ctrl+P the previous one", async () => {
    const { input } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "n", ctrlKey: true })
    await fireEvent.keyDown(input, { key: "n", ctrlKey: true })
    await fireEvent.keyDown(input, { key: "p", ctrlKey: true })

    expect(selectedOption()?.textContent).toContain("Calendar")
  })

  it("points the search field's aria-activedescendant at the selected result", async () => {
    const { input } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "ArrowDown" })

    expect(input.getAttribute("aria-activedescendant")).toBe(selectedOption()?.id)
  })

  it("Enter opens the selected result, and Spotlight closes once it opened", async () => {
    const { connection, close, input } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))
    await fireEvent.keyDown(input, { key: "ArrowDown" })

    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.chosen).toStrictEqual([threeTabs[1]])
    await waitFor(() => expect(close).toHaveBeenCalled())
  })

  it("Enter typed before the answer to the latest input comes opens what that input finds", async () => {
    const { connection, input } = renderSpotlight()
    await connection.answer("", threeTabs)
    await settle()

    await type(input, "cal")
    await fireEvent.keyDown(input, { key: "Enter" })
    await connection.answer("cal", [tab(2, "Calendar")])
    await settle()

    expect(connection.chosen).toStrictEqual([tab(2, "Calendar")])
  })

  it("Enter opens nothing when the answer to the latest input never comes", async () => {
    const { connection, input } = renderSpotlight()
    await connection.answer("", threeTabs)
    await settle()

    await type(input, "cal")
    await fireEvent.keyDown(input, { key: "Enter" })
    await connection.answer("cal", [], { unreachable: true })
    await settle()

    expect(connection.chosen).toStrictEqual([])
  })

  it("when the result can't be opened, shows why and stays open", async () => {
    const { close, input } = renderSpotlight({
      respond: () => threeTabs,
      outcome: { _tag: "Failed", reason: "Couldn't open it" },
    })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't open it"))
    expect(close).not.toHaveBeenCalled()
  })

  it("an Enter pressed while an input method is composing opens nothing", async () => {
    const { connection, input } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "Enter", isComposing: true })

    expect(connection.chosen).toStrictEqual([])
  })

  it("Escape closes Spotlight", async () => {
    const { close, input } = renderSpotlight({ respond: () => threeTabs })

    await fireEvent.keyDown(input, { key: "Escape" })

    expect(close).toHaveBeenCalled()
  })
})

describe("choosing with the mouse", () => {
  it("clicking a result opens it", async () => {
    const { connection } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.click(screen.getAllByRole("option")[2] as HTMLElement)

    expect(connection.chosen).toStrictEqual([threeTabs[2]])
  })
})

describe("moving to another window", () => {
  it("closes Spotlight", async () => {
    const { close } = renderSpotlight({ respond: () => threeTabs })

    await fireEvent.blur(window)

    expect(close).toHaveBeenCalled()
  })
})

describe("command mode", () => {
  it("is entered with Tab on an empty query, and searches commands only", async () => {
    const { connection, input } = renderSpotlight({ respond: respondByMode })

    await fireEvent.keyDown(input, { key: "Tab" })

    expect(connection.searches.at(-1)).toStrictEqual({ query: "", mode: "Actions" })
    expect(input.getAttribute("placeholder")).toBe("Search commands")
    expect(document.activeElement).toBe(input)
  })

  it("searches commands only for what is typed", async () => {
    const { connection, input } = renderSpotlight({ respond: respondByMode })
    await fireEvent.keyDown(input, { key: "Tab" })

    await type(input, "copy")

    expect(connection.searches.at(-1)).toStrictEqual({ query: "copy", mode: "Actions" })
  })

  it("isn't entered with Tab while there is a query", async () => {
    const { connection, input } = renderSpotlight({ respond: respondByMode })
    await type(input, "katip")

    await fireEvent.keyDown(input, { key: "Tab" })

    expect(connection.searches.every(({ mode }) => mode === "All")).toBe(true)
  })

  it("isn't entered with Shift+Tab", async () => {
    const { connection, input } = renderSpotlight({ respond: respondByMode })

    await fireEvent.keyDown(input, { key: "Tab", shiftKey: true })

    expect(connection.searches.every(({ mode }) => mode === "All")).toBe(true)
  })

  it("goes back to the usual search with Backspace on an empty query", async () => {
    const { connection, input } = renderSpotlight({ respond: respondByMode })
    await fireEvent.keyDown(input, { key: "Tab" })

    await fireEvent.keyDown(input, { key: "Backspace" })

    expect(connection.searches.at(-1)).toStrictEqual({ query: "", mode: "All" })
    expect(input.getAttribute("placeholder")).toBe("Search or enter a URL")
  })

  it("goes back to the usual search with Escape, instead of closing", async () => {
    const { close, connection, input } = renderSpotlight({ respond: respondByMode })
    await fireEvent.keyDown(input, { key: "Tab" })

    await fireEvent.keyDown(input, { key: "Escape" })

    expect(close).not.toHaveBeenCalled()
    expect(connection.searches.at(-1)).toStrictEqual({ query: "", mode: "All" })
  })

  it("says no command matched when none does", async () => {
    const { input } = renderSpotlight({
      respond: (_, mode) => (mode === "Actions" ? [] : threeTabs),
    })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "Tab" })

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("No matching commands"),
    )
  })
})

describe("a command row", () => {
  it("shows the assigned keys, and none when no keys are assigned", async () => {
    renderSpotlight({ respond: () => commands })

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2))

    const [copy, duplicate] = screen.getAllByRole("option")
    expect(copy?.querySelector("kbd")?.textContent).toBe("⇧⌘C")
    expect(duplicate?.querySelector("kbd")).toBeNull()
  })

  it("sends that the command was chosen on Enter", async () => {
    const { connection, input } = renderSpotlight({ respond: () => commands })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2))
    await fireEvent.keyDown(input, { key: "ArrowDown" })

    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.chosen).toStrictEqual([commands[1]])
  })
})

describe("bangs", () => {
  const githubSuggestion: SpotlightResult = {
    _tag: "BangSuggestion",
    siteName: "GitHub",
    trigger: "gh",
    iconPageUrl: "https://github.com/",
  }
  const githubSearch: SpotlightResult = {
    _tag: "SiteSearch",
    siteName: "GitHub",
    trigger: "gh",
    query: "katip",
    url: "https://github.com/search?q=katip",
    iconPageUrl: "https://github.com/",
  }
  const searchLinear: SpotlightResult = {
    _tag: "SiteCommand",
    title: "Search Linear",
    url: "https://linear.app/search?q=%s",
    keyword: "lin",
    searches: true,
    iconPageUrl: "https://linear.app/",
  }
  const githubOwnSearch: SpotlightResult = {
    ...githubSearch,
    query: "",
    url: "https://github.com/",
  }
  const respondWithBangs = (query: string, mode: SpotlightMode) =>
    mode === "Actions"
      ? [searchLinear]
      : query === "!g"
        ? [githubSuggestion]
        : query === "!gh katip"
          ? [githubSearch, webSearch(query)]
          : query === "!gh" || query === "!gh "
            ? [githubOwnSearch, webSearch(query)]
            : []

  const field = () => screen.getByRole("combobox") as HTMLInputElement

  it("a suggestion chosen with Enter puts Spotlight in its site, before an empty field, opening nothing", async () => {
    const { connection, input } = renderSpotlight({ respond: respondWithBangs })
    await type(input, "!g")
    await settle()

    await fireEvent.keyDown(input, { key: "Enter" })

    expect([
      field().value,
      field().getAttribute("aria-label"),
      connection.searches.at(-1),
    ]).toStrictEqual(["", "GitHub: what to search for", { query: "!gh ", mode: "Site" }])
    expect(connection.chosen).toStrictEqual([])
  })

  it("a suggestion is entered with Tab too, which the hints say", async () => {
    const { input } = renderSpotlight({ respond: respondWithBangs })
    await type(input, "!g")
    await settle()
    expect(screen.getByText("Fill In")).toBeTruthy()

    await fireEvent.keyDown(input, { key: "Tab" })

    expect(field().getAttribute("aria-label")).toBe("GitHub: what to search for")
  })

  it("a whole trigger with nothing after it is entered with Tab", async () => {
    const { input } = renderSpotlight({ respond: respondWithBangs })
    await type(input, "!gh")
    await settle()

    await fireEvent.keyDown(input, { key: "Tab" })

    expect([field().value, field().getAttribute("aria-label")]).toStrictEqual([
      "",
      "GitHub: what to search for",
    ])
  })

  it("a whole trigger followed by a space is entered as it is typed", async () => {
    const { input } = renderSpotlight({ respond: respondWithBangs })

    await type(input, "!gh ")
    await settle()

    expect([field().value, field().getAttribute("aria-label")]).toStrictEqual([
      "",
      "GitHub: what to search for",
    ])
  })

  it("in a site, what is typed searches the site alone, which is all that is offered", async () => {
    const { connection, input } = renderSpotlight({ respond: respondWithBangs })
    await type(input, "!gh")
    await settle()
    await fireEvent.keyDown(input, { key: "Tab" })
    await settle()

    await type(input, "katip")
    await settle()

    expect([connection.searches.at(-1), optionNames().length]).toStrictEqual([
      { query: "!gh katip", mode: "Site" },
      1,
    ])
  })

  it("in a site, Enter typed before the answer comes searches the site for all that was typed", async () => {
    const { connection, input } = renderSpotlight()
    await connection.answer("", [])
    await type(input, "!gh ")
    await connection.answer("!gh ", [githubOwnSearch])
    await settle()

    await type(input, "katip")
    await fireEvent.keyDown(input, { key: "Enter" })
    await connection.answer("!gh katip", [githubSearch])
    await settle()

    expect(connection.chosen).toStrictEqual([githubSearch])
  })

  it("Backspace in the empty field leaves the site, giving back its bang to change", async () => {
    const { input } = renderSpotlight({ respond: respondWithBangs })
    await type(input, "!gh ")
    await settle()

    await fireEvent.keyDown(input, { key: "Backspace" })

    expect([field().value, field().getAttribute("aria-label")]).toStrictEqual([
      "!gh",
      "Search tabs, pinned tabs, Spaces, bookmarks, history, and commands",
    ])
  })

  it("Escape leaves the site rather than closing Spotlight", async () => {
    const { close, input } = renderSpotlight({ respond: respondWithBangs })
    await type(input, "!gh ")
    await settle()

    await fireEvent.keyDown(input, { key: "Escape" })

    expect([field().value, close.mock.calls.length]).toStrictEqual(["!gh", 0])
  })

  it("a ! takes down what was found for the text before it, without waiting for the answer", async () => {
    const { connection, input } = renderSpotlight()
    await connection.answer("", threeTabs)
    await settle()

    await type(input, "!")
    await settle()

    expect(screen.queryAllByRole("option")).toStrictEqual([])
  })

  it("Tab with nothing to fill in keeps the search field focused, and leaves it as typed", async () => {
    const { input } = renderSpotlight({ respond: respondWithBangs })
    await type(input, "!gh katip")
    await settle()

    const notCancelled = await fireEvent.keyDown(input, { key: "Tab" })

    expect([notCancelled, (input as HTMLInputElement).value]).toStrictEqual([false, "!gh katip"])
  })

  it("a site search is opened by the background on Enter", async () => {
    const { connection, input } = renderSpotlight({ respond: respondWithBangs })
    await type(input, "!gh katip")
    await settle()

    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.chosen).toStrictEqual([githubSearch])
  })

  it("a site search with nothing typed after its bang opens the site on Enter", async () => {
    const { connection, input } = renderSpotlight({ respond: respondWithBangs })
    await type(input, "!gh")
    await settle()

    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.chosen).toStrictEqual([githubOwnSearch])
  })

  it("a command that searches, chosen in command mode, puts Spotlight in its site", async () => {
    const { connection, input } = renderSpotlight({ respond: respondWithBangs })
    await fireEvent.keyDown(input, { key: "Tab" })
    await settle()

    await fireEvent.keyDown(input, { key: "Enter" })

    expect([field().getAttribute("aria-label"), connection.searches.at(-1)]).toStrictEqual([
      "Search Linear: what to search for",
      { query: "!lin ", mode: "Site" },
    ])
    expect(screen.queryByText("Commands")).toBeNull()
  })
})

describe("a history row", () => {
  it("shows when the page was last visited", async () => {
    renderSpotlight({ respond: () => [historyPage("Blog post", 3)] })

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1))

    expect(screen.getByRole("option").textContent).toContain("3 days ago")
  })
})

describe("the display language", () => {
  it("with Japanese chosen, writes the search field and the results in Japanese", async () => {
    const { input } = renderSpotlight({ respond: () => threeTabs }, "ja")

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    expect(input.getAttribute("placeholder")).toBe("検索するか URL を入力")
    expect(input.getAttribute("aria-label")).toBe(
      "タブ・ピン・Space・ブックマーク・履歴・コマンドを検索",
    )
    expect(screen.getAllByRole("option")[0]?.textContent).toContain("タブ")
  })

  it("translates the command mode's badge and placeholder too", async () => {
    const { input } = renderSpotlight({ respond: respondByMode }, "ja")

    await fireEvent.keyDown(input, { key: "Tab" })

    expect(input.getAttribute("placeholder")).toBe("コマンドを検索")
    expect(screen.getByText("コマンド", { selector: ".mode-chip" })).toBeTruthy()
  })

  it("writes when a page was last visited in that language's wording", async () => {
    renderSpotlight({ respond: () => [historyPage("Blog post", 3)] }, "ja")

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1))

    expect(screen.getByRole("option").textContent).toContain("3 日前")
  })

  it("says the background couldn't be reached in that language too", async () => {
    const { connection } = renderSpotlight({}, "ja")

    await connection.answer("", [], { unreachable: true })

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Katip に接続できませんでした。もう一度お試しください",
      ),
    )
  })
})
