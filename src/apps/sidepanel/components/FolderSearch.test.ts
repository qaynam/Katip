import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { BookmarkId } from "#platform/browser"
import type { PinnedNodeView } from "#protocol"
import { renderSidebar } from "../testing/render-sidebar"
import {
  liveItem,
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  sidebarView,
  spaceView,
} from "../testing/view-builders"

const HOUR_MS = 60 * 60_000

const viewWithPins = (...nodes: ReadonlyArray<PinnedNodeView>) =>
  sidebarView({ spaces: [spaceView("work", { pinnedNodes: nodes })] })

const closedDocs = () =>
  pinnedFolder("docs", {
    title: "資料",
    isExpanded: false,
    children: [
      pinnedItem("api", { title: "API 設計書" }),
      pinnedItem("flow", { title: "画面遷移図" }),
      pinnedItem("minutes", { title: "定例の議事録" }),
    ],
  })

const openSearch = async () => {
  await fireEvent.click(screen.getByRole("button", { name: "フォルダ内を検索" }))
  return screen.getByRole("combobox", { name: "フォルダ内を検索" })
}

const shownOptions = () =>
  within(screen.getByRole("listbox"))
    .queryAllByRole("option")
    .map((option) => option.textContent)

const optionsTitled = (...titles: ReadonlyArray<string>) =>
  titles.map((title) => expect.stringContaining(title))

describe("閉じたフォルダの中の検索", () => {
  it("虫眼鏡を押すと、フォルダの中身を並べた検索の小窓が開く", async () => {
    await renderSidebar(viewWithPins(closedDocs()))

    await openSearch()

    expect(shownOptions()).toStrictEqual(optionsTitled("API 設計書", "画面遷移図", "定例の議事録"))
  })

  it("入力した語を含む項目だけに絞り込む", async () => {
    await renderSidebar(viewWithPins(closedDocs()))
    const input = await openSearch()

    await fireEvent.input(input, { target: { value: "設計" } })

    expect(shownOptions()).toStrictEqual(optionsTitled("API 設計書"))
  })

  it("Enter で、先頭の項目を開いて小窓を閉じる", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedDocs()))
    const input = await openSearch()

    await fireEvent.input(input, { target: { value: "議事録" } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId: 1, bookmarkId: BookmarkId.make("minutes") },
    ])
    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("↓ と ↑ で選ぶ項目を動かし、Enter でその項目を開く", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedDocs()))
    const input = await openSearch()

    await fireEvent.keyDown(input, { key: "ArrowDown" })
    await fireEvent.keyDown(input, { key: "ArrowDown" })
    await fireEvent.keyDown(input, { key: "ArrowUp" })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId: 1, bookmarkId: BookmarkId.make("flow") },
    ])
  })

  it("一致する項目が無ければ、そのことを示す", async () => {
    await renderSidebar(viewWithPins(closedDocs()))
    const input = await openSearch()

    await fireEvent.input(input, { target: { value: "見つからない語" } })

    expect(screen.getByText("一致する項目はありません")).toBeTruthy()
  })

  it("Escape で、何も開かずに小窓を閉じる", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedDocs()))
    const input = await openSearch()

    await fireEvent.keyDown(input, { key: "Escape" })

    expect(screen.queryByRole("combobox")).toBeNull()
    expect(connection.sentCommands).toStrictEqual([])
  })

  it("開いているフォルダには虫眼鏡を出さない", async () => {
    await renderSidebar(viewWithPins({ ...closedDocs(), isExpanded: true }))

    expect(screen.queryByRole("button", { name: "フォルダ内を検索" })).toBeNull()
  })
})

describe("閉じたライブフォルダの中の検索", () => {
  const closedInbox = () =>
    pinnedLiveFolder("inbox", {
      title: "受信トレイ",
      isExpanded: false,
      items: [
        liveItem("quote", {
          title: "見積もりの件",
          subtitle: "山田 太郎",
          updatedAt: Date.now() - 2 * HOUR_MS,
        }),
      ],
    })

  it("項目に、取得元で更新されてからの時間と補足を添える", async () => {
    await renderSidebar(viewWithPins(closedInbox()))

    await openSearch()

    expect(screen.getByRole("option", { name: /見積もりの件/ }).textContent).toContain(
      "2 時間前 · 山田 太郎",
    )
  })

  it("選ぶとその項目を開く", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedInbox()))
    await openSearch()

    await fireEvent.click(screen.getByRole("option", { name: /見積もりの件/ }))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "OpenLiveItem",
        windowId: 1,
        bookmarkId: BookmarkId.make("inbox"),
        itemId: "quote",
      },
    ])
  })
})
