import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte"
import { tick } from "svelte"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SpaceName } from "#modules/space"
import { TabId } from "#platform/browser"
import type { SpotlightMode, SpotlightResult } from "#protocol"
import App from "./App.svelte"
import { createFakeConnection, type FakeConnectionOptions } from "./testing/fake-connection"

// jsdom はレイアウトを持たず scrollIntoView も実装していない
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const tab = (id: number, title: string): SpotlightResult => ({
  _tag: "OpenTab",
  tabId: TabId.make(id),
  title,
  url: `https://example.com/${id}`,
  favIconUrl: null,
  spaceName: SpaceName.make("仕事"),
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

const commands = [command("URL をコピー", "⇧⌘C"), command("タブを複製", null)]

const respondByMode = (query: string, mode: SpotlightMode) =>
  mode === "Actions" ? commands : query === "" ? threeTabs : [webSearch(query)]

const threeTabs = [tab(1, "メール"), tab(2, "カレンダー"), tab(3, "ドキュメント")]

const renderSpotlight = (options: FakeConnectionOptions = {}) => {
  const connection = createFakeConnection(options)
  const close = vi.fn()
  render(App, { props: { connection, faviconUrl: () => null, close } })
  return { connection, close, input: screen.getByRole("combobox") }
}

const optionNames = () => screen.getAllByRole("option").map((option) => option.textContent ?? "")

const selectedOption = () =>
  screen.getAllByRole("option").find((option) => option.getAttribute("aria-selected") === "true")

const type = (input: HTMLElement, value: string) => fireEvent.input(input, { target: { value } })

/** 届いた応答の処理と再描画を済ませる。 */
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await tick()
}

describe("開いたとき", () => {
  it("空の検索語で問い合わせ、応答が届くまでは読み込み中と出す", () => {
    const { connection } = renderSpotlight()

    expect(connection.searches).toStrictEqual([{ query: "", mode: "All" }])
    expect(screen.getByRole("status").textContent).toBe("読み込み中…")
  })

  it("応答が届くと候補を並べ、先頭を選んだ状態にする", async () => {
    const { connection } = renderSpotlight()

    await connection.answer("", threeTabs)

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))
    expect(selectedOption()?.textContent).toContain("メール")
  })

  it("検索欄にフォーカスがある", () => {
    const { input } = renderSpotlight()

    expect(document.activeElement).toBe(input)
  })
})

describe("入力したとき", () => {
  it("入力のたびにその検索語で問い合わせる", async () => {
    const { connection, input } = renderSpotlight({ respond: () => [] })

    await type(input, "k")
    await type(input, "ka")

    expect(connection.searches.map(({ query }) => query)).toStrictEqual(["", "k", "ka"])
  })

  it("古い入力の応答が後から届いても、最新の入力の候補を出し続ける", async () => {
    const { connection, input } = renderSpotlight()
    await connection.answer("", [])
    await type(input, "メ")
    await type(input, "メー")

    await connection.answer("メー", [tab(1, "メール")])
    await connection.answer("メ", [tab(1, "メール"), tab(4, "メモ")])
    await settle()

    expect(optionNames()).toHaveLength(1)
    expect(optionNames()[0]).toContain("メール")
  })

  it("一致する候補が無ければそのことを出し、ウェブ検索の項目は並べる", async () => {
    const { input } = renderSpotlight({
      respond: (query) => (query === "" ? [] : [webSearch(query)]),
    })

    await type(input, "zzz")

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("一致するものはありません"),
    )
    expect(optionNames()).toHaveLength(1)
  })

  it("検索語が空で何も無ければ、最近使ったタブが無いと出す", async () => {
    renderSpotlight({ respond: () => [] })

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("最近使ったタブはありません"),
    )
  })

  it("background に届かなければ、接続できなかったことを出す", async () => {
    const { connection } = renderSpotlight()

    await connection.answer("", [], { unreachable: true })

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("接続できませんでした"),
    )
  })
})

describe("キーボードで選ぶとき", () => {
  it("↓ で次の候補、↑ で前の候補を選ぶ", async () => {
    const { input } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "ArrowDown" })
    await fireEvent.keyDown(input, { key: "ArrowDown" })
    await fireEvent.keyDown(input, { key: "ArrowUp" })

    expect(selectedOption()?.textContent).toContain("カレンダー")
  })

  it("選んでいる候補を検索欄の aria-activedescendant で示す", async () => {
    const { input } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "ArrowDown" })

    expect(input.getAttribute("aria-activedescendant")).toBe(selectedOption()?.id)
  })

  it("Enter で選んでいる候補を開き、開けたら閉じる", async () => {
    const { connection, close, input } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))
    await fireEvent.keyDown(input, { key: "ArrowDown" })

    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.chosen).toStrictEqual([threeTabs[1]])
    await waitFor(() => expect(close).toHaveBeenCalled())
  })

  it("開けなければ理由を出し、閉じない", async () => {
    const { close, input } = renderSpotlight({
      respond: () => threeTabs,
      outcome: { _tag: "Failed", reason: "開けませんでした" },
    })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("開けませんでした"))
    expect(close).not.toHaveBeenCalled()
  })

  it("日本語の変換中に押した Enter では開かない", async () => {
    const { connection, input } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "Enter", isComposing: true })

    expect(connection.chosen).toStrictEqual([])
  })

  it("Escape で閉じる", async () => {
    const { close, input } = renderSpotlight({ respond: () => threeTabs })

    await fireEvent.keyDown(input, { key: "Escape" })

    expect(close).toHaveBeenCalled()
  })
})

describe("マウスで選ぶとき", () => {
  it("候補を押すとその候補を開く", async () => {
    const { connection } = renderSpotlight({ respond: () => threeTabs })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.click(screen.getAllByRole("option")[2] as HTMLElement)

    expect(connection.chosen).toStrictEqual([threeTabs[2]])
  })
})

describe("ほかのウィンドウへ移ったとき", () => {
  it("閉じる", async () => {
    const { close } = renderSpotlight({ respond: () => threeTabs })

    await fireEvent.blur(window)

    expect(close).toHaveBeenCalled()
  })
})

describe("コマンドモード", () => {
  it("入力が空で Tab を押すとコマンドモードになり、コマンドだけを探す要求を送る", async () => {
    const { connection, input } = renderSpotlight({ respond: respondByMode })

    await fireEvent.keyDown(input, { key: "Tab" })

    expect(connection.searches.at(-1)).toStrictEqual({ query: "", mode: "Actions" })
    expect(input.getAttribute("placeholder")).toBe("コマンドを検索")
    expect(document.activeElement).toBe(input)
  })

  it("コマンドモードで入力すると、その語でコマンドだけを探す", async () => {
    const { connection, input } = renderSpotlight({ respond: respondByMode })
    await fireEvent.keyDown(input, { key: "Tab" })

    await type(input, "コピー")

    expect(connection.searches.at(-1)).toStrictEqual({ query: "コピー", mode: "Actions" })
  })

  it("入力があるときの Tab ではコマンドモードにならない", async () => {
    const { connection, input } = renderSpotlight({ respond: respondByMode })
    await type(input, "katip")

    await fireEvent.keyDown(input, { key: "Tab" })

    expect(connection.searches.every(({ mode }) => mode === "All")).toBe(true)
  })

  it("Shift+Tab ではコマンドモードにならない", async () => {
    const { connection, input } = renderSpotlight({ respond: respondByMode })

    await fireEvent.keyDown(input, { key: "Tab", shiftKey: true })

    expect(connection.searches.every(({ mode }) => mode === "All")).toBe(true)
  })

  it("コマンドモードで入力が空のまま Backspace を押すと通常の検索に戻る", async () => {
    const { connection, input } = renderSpotlight({ respond: respondByMode })
    await fireEvent.keyDown(input, { key: "Tab" })

    await fireEvent.keyDown(input, { key: "Backspace" })

    expect(connection.searches.at(-1)).toStrictEqual({ query: "", mode: "All" })
    expect(input.getAttribute("placeholder")).toBe("検索するか URL を入力")
  })

  it("コマンドモードで Escape を押すと閉じずに通常の検索に戻る", async () => {
    const { close, connection, input } = renderSpotlight({ respond: respondByMode })
    await fireEvent.keyDown(input, { key: "Tab" })

    await fireEvent.keyDown(input, { key: "Escape" })

    expect(close).not.toHaveBeenCalled()
    expect(connection.searches.at(-1)).toStrictEqual({ query: "", mode: "All" })
  })

  it("一致するコマンドが無ければそのことを出す", async () => {
    const { input } = renderSpotlight({
      respond: (_, mode) => (mode === "Actions" ? [] : threeTabs),
    })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3))

    await fireEvent.keyDown(input, { key: "Tab" })

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("一致するコマンドはありません"),
    )
  })
})

describe("コマンドの行", () => {
  it("割り当てたキーが表示され、割り当てが無ければ出ない", async () => {
    renderSpotlight({ respond: () => commands })

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2))

    const [copy, duplicate] = screen.getAllByRole("option")
    expect(copy?.querySelector("kbd")?.textContent).toBe("⇧⌘C")
    expect(duplicate?.querySelector("kbd")).toBeNull()
  })

  it("Enter を押すと、そのコマンドを選んだことを送る", async () => {
    const { connection, input } = renderSpotlight({ respond: () => commands })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2))
    await fireEvent.keyDown(input, { key: "ArrowDown" })

    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.chosen).toStrictEqual([commands[1]])
  })
})

describe("履歴の行", () => {
  it("最後に訪れた時刻が出る", async () => {
    renderSpotlight({ respond: () => [historyPage("ブログの記事", 3)] })

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1))

    expect(screen.getByRole("option").textContent).toContain("3 日前")
  })
})
