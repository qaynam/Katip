import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte"
import { tick } from "svelte"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SpaceName } from "#modules/space"
import { TabId } from "#platform/browser"
import type { SpotlightResult } from "#protocol"
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

    expect(connection.searchedQueries).toStrictEqual([""])
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

    expect(connection.searchedQueries).toStrictEqual(["", "k", "ka"])
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
      expect(screen.getByRole("status").textContent).toContain(
        "一致するタブ・ピン・ブックマークはありません",
      ),
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
