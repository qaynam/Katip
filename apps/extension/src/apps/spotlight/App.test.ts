import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte"
import { tick } from "svelte"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type Locale, makeTranslator } from "#modules/i18n"
import { SpaceName } from "#modules/space"
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

const renderSpotlight = (options: FakeConnectionOptions = {}, locale: Locale = "en") => {
  const connection = createFakeConnection(options)
  const close = vi.fn()
  render(App, {
    props: { connection, faviconUrl: () => null, close, translator: makeTranslator(locale) },
  })
  return { connection, close, input: screen.getByRole("combobox") }
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
