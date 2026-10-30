import { describe, expect, it } from "vitest"
import { BookmarkId, TabId, WindowId } from "#platform/browser"
import {
  liveItem,
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  pinnedSplit,
  tabView,
} from "../testing/view-builders"
import { filterFolderSearch, folderSearchEntries } from "./folder-search"

const windowId = WindowId.make(1)

describe("folderSearchEntries", () => {
  it("入れ子のフォルダやライブフォルダの中身も、フォルダの中での並び順に並べる", () => {
    const folder = pinnedFolder("docs", {
      children: [
        pinnedItem("spec", { title: "仕様書" }),
        pinnedFolder("minutes", { children: [pinnedItem("1028", { title: "10/28 定例" })] }),
        pinnedLiveFolder("inbox", { items: [liveItem("mail", { title: "見積もりの件" })] }),
      ],
    })

    const titles = folderSearchEntries(folder, windowId).map((entry) => entry.title)

    expect(titles).toStrictEqual(["仕様書", "10/28 定例", "見積もりの件"])
  })

  it("閉じたピンを選ぶとそのピンを開き、開いているピンを選ぶとそのタブへ切り替える", () => {
    const folder = pinnedFolder("docs", {
      children: [pinnedItem("closed"), pinnedItem("open", { openTab: openPinnedTab(tabView(7)) })],
    })

    const commands = folderSearchEntries(folder, windowId).map((entry) => entry.command)

    expect(commands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId, bookmarkId: BookmarkId.make("closed") },
      { _tag: "ActivateTab", tabId: TabId.make(7) },
    ])
  })

  it("閉じた分割ビューのピンは、どちらの側を選んでも 2 つ揃えて開く", () => {
    const folder = pinnedFolder("docs", {
      children: [pinnedSplit("pair", [pinnedItem("left"), pinnedItem("right")])],
    })

    const commands = folderSearchEntries(folder, windowId).map((entry) => entry.command)

    expect(commands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId, bookmarkId: BookmarkId.make("pair") },
      { _tag: "OpenPinnedItem", windowId, bookmarkId: BookmarkId.make("pair") },
    ])
  })

  it("ライブの項目は取得元での更新時刻を持ち、選ぶとその項目を開く", () => {
    const folder = pinnedLiveFolder("inbox", {
      items: [liveItem("mail", { updatedAt: 1_000, isUnseen: true })],
    })

    expect(folderSearchEntries(folder, windowId)).toMatchObject([
      {
        lastActivityAt: 1_000,
        isUnseen: true,
        command: {
          _tag: "OpenLiveItem",
          windowId,
          bookmarkId: BookmarkId.make("inbox"),
          itemId: "mail",
        },
      },
    ])
  })

  it("ピンには時刻が無い", () => {
    const [entry] = folderSearchEntries(
      pinnedFolder("docs", { children: [pinnedItem("spec")] }),
      windowId,
    )

    expect(entry?.lastActivityAt).toBeNull()
  })

  it("空のフォルダには項目が無い", () => {
    expect(folderSearchEntries(pinnedFolder("empty"), windowId)).toStrictEqual([])
  })
})

describe("filterFolderSearch", () => {
  const entries = folderSearchEntries(
    pinnedFolder("docs", {
      children: [
        pinnedItem("api", { title: "API 設計書", url: "https://docs.example.com/api" }),
        pinnedItem("flow", { title: "画面遷移図", url: "https://design.example.com/flow" }),
        pinnedLiveFolder("inbox", {
          items: [liveItem("mail", { title: "見積もりの件", subtitle: "山田 太郎" })],
        }),
      ],
    }),
    windowId,
  )
  const titlesFor = (query: string) =>
    filterFolderSearch(entries, query).map((entry) => entry.title)

  it("空の検索語ならすべてを元の並びのまま残す", () => {
    expect(titlesFor("  ")).toStrictEqual(["API 設計書", "画面遷移図", "見積もりの件"])
  })

  it("タイトル・補足・URL のどこかに検索語を含むものだけを残す", () => {
    expect(titlesFor("設計")).toStrictEqual(["API 設計書"])
    expect(titlesFor("山田")).toStrictEqual(["見積もりの件"])
    expect(titlesFor("design.example")).toStrictEqual(["画面遷移図"])
  })

  it("空白で区切った語は、すべてを含むものだけを残す", () => {
    expect(titlesFor("api 設計")).toStrictEqual(["API 設計書"])
    expect(titlesFor("api 遷移")).toStrictEqual([])
  })

  it("大文字と小文字、全角と半角を区別しない", () => {
    expect(titlesFor("ＡＰＩ")).toStrictEqual(["API 設計書"])
  })
})
