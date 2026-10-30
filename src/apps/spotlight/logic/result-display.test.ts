import { describe, expect, it } from "vitest"
import { SpaceId, SpaceName } from "#modules/space"
import { neutralTheme, swatchOf, themeOf } from "#modules/theme"
import { BookmarkId, TabId } from "#platform/browser"
import type { SpotlightResult } from "#protocol"
import { displayOf, isMatchedCandidate } from "./result-display"

const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000

const display = (result: SpotlightResult) => displayOf(result, NOW)

const openTab = (
  overrides: Partial<Extract<SpotlightResult, { _tag: "OpenTab" }>> = {},
): SpotlightResult => ({
  _tag: "OpenTab",
  tabId: TabId.make(1),
  title: "設計ドキュメント",
  url: "https://www.docs.example/design/",
  favIconUrl: null,
  spaceName: SpaceName.make("仕事"),
  isFavorite: false,
  isInOtherWindow: false,
  ...overrides,
})

const pin = (
  overrides: Partial<Extract<SpotlightResult, { _tag: "Pin" }>> = {},
): SpotlightResult => ({
  _tag: "Pin",
  bookmarkId: BookmarkId.make("10"),
  title: "メール",
  url: "https://mail.example/",
  spaceName: SpaceName.make("仕事"),
  folderPath: [],
  isSplit: false,
  ...overrides,
})

describe("開いているタブの表示", () => {
  it("補足に所属する Space と URL を出す", () => {
    expect(display(openTab()).detail).toBe("仕事 · docs.example/design")
  })

  it("Favorites のタブは Favorites と出す", () => {
    expect(display(openTab({ isFavorite: true, spaceName: null })).detail).toBe(
      "Favorites · docs.example/design",
    )
  })

  it("どの Space にも属さないタブはそのことを出す", () => {
    expect(display(openTab({ spaceName: null })).detail).toBe(
      "Space に属さないタブ · docs.example/design",
    )
  })

  it("別のウィンドウのタブはそのことを出す", () => {
    expect(display(openTab({ isInOtherWindow: true })).detail).toBe(
      "仕事 · 別のウィンドウ · docs.example/design",
    )
  })

  it("種類はタブと出す", () => {
    expect(display(openTab()).kindLabel).toBe("タブ")
  })
})

describe("閉じているピンの表示", () => {
  it("補足に Space からフォルダまでの階層と URL を出す", () => {
    expect(display(pin({ folderPath: ["連絡", "社外"] })).detail).toBe(
      "仕事 › 連絡 › 社外 · mail.example",
    )
  })

  it("分割ビューのピンは URL の代わりに分割ビューと出す", () => {
    expect(display(pin({ isSplit: true })).detail).toBe("仕事 · 分割ビュー")
  })
})

describe("Space の表示", () => {
  const space = (
    isActive: boolean,
    theme = themeOf([{ hue: 200, chroma: 0.5 }]),
  ): SpotlightResult => ({
    _tag: "Space",
    spaceId: SpaceId.make("work"),
    name: SpaceName.make("仕事"),
    theme,
    isActive,
  })

  it("今の Space はそのことを出す", () => {
    expect(display(space(true)).detail).toBe("現在の Space")
  })

  it("ほかの Space は切り替えられることを出す", () => {
    expect(display(space(false)).detail).toBe("この Space に切り替える")
  })

  it("アイコンはテーマの主色の見本にする", () => {
    expect(display(space(false)).icon).toStrictEqual({
      _tag: "Swatch",
      color: swatchOf({ hue: 200, chroma: 0.5 }),
    })
  })

  it("色の無いテーマなら灰色の見本にする", () => {
    expect(display(space(false, neutralTheme)).icon).toStrictEqual({
      _tag: "Swatch",
      color: swatchOf({ hue: 0, chroma: 0 }),
    })
  })
})

describe("ブックマークの表示", () => {
  it("名前の無いブックマークは URL を名前にする", () => {
    const shown = display({
      _tag: "Bookmark",
      bookmarkId: BookmarkId.make("20"),
      title: " ",
      url: "https://effect.website/",
    })

    expect(shown.title).toBe("effect.website")
  })
})

describe("履歴の表示", () => {
  const history = (title: string, daysAgo: number): SpotlightResult => ({
    _tag: "History",
    title,
    url: "https://www.blog.example/posts/1/",
    lastVisitedAt: NOW - daysAgo * DAY,
  })

  it("補足に URL と、最後に訪れたのがどれだけ前かを出す", () => {
    expect(display(history("記事", 3)).detail).toBe("blog.example/posts/1 · 3 日前")
  })

  it("名前の無いページは URL を名前にする", () => {
    expect(display(history("", 1)).title).toBe("blog.example/posts/1")
  })

  it("種類は履歴と出す", () => {
    expect(display(history("記事", 1)).kindLabel).toBe("履歴")
  })
})

describe("コマンドの表示", () => {
  const command = (shortcut: string | null): SpotlightResult => ({
    _tag: "Action",
    action: { _tag: "CopyUrl" },
    title: "URL をコピー",
    shortcut,
  })

  it("割り当てたキーを持つ", () => {
    expect(display(command("⇧⌘C")).shortcut).toBe("⇧⌘C")
  })

  it("キーが割り当てられていなければ、キーを持たない", () => {
    expect(display(command(null)).shortcut).toBeNull()
  })

  it("コマンドのアイコンで、種類はコマンドと出す", () => {
    const shown = display(command(null))

    expect([shown.icon, shown.kindLabel]).toStrictEqual([{ _tag: "Command" }, "コマンド"])
  })

  it("コマンド以外の行はキーを持たない", () => {
    expect(display(openTab()).shortcut).toBeNull()
  })
})

describe("URL を開く項目とウェブ検索の項目", () => {
  it("URL を開く項目は、その URL を名前にして「開く」と出す", () => {
    const shown = display({ _tag: "OpenUrl", url: "https://example.com" })

    expect([shown.title, shown.kindLabel]).toStrictEqual(["https://example.com", "開く"])
  })

  it("ウェブ検索の項目は、検索語を名前にして「ウェブで検索」と出す", () => {
    const shown = display({ _tag: "SearchWeb", query: "katip" })

    expect([shown.title, shown.kindLabel]).toStrictEqual(["katip", "ウェブで検索"])
  })

  it("検索に一致した候補とはみなさない", () => {
    expect(
      [
        { _tag: "OpenUrl", url: "https://example.com" } as const,
        { _tag: "SearchWeb", query: "katip" } as const,
        openTab(),
      ].map(isMatchedCandidate),
    ).toStrictEqual([false, false, true])
  })
})
