import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { bookmarkTitleChange, spaceNameChange, tabTitleChange } from "./drafts"

describe("spaceNameChange", () => {
  it("前後の空白を除いた新しい名前に改名する", () => {
    expect(Option.getOrNull(spaceNameChange("  読書 ", "仕事"))).toBe("読書")
  })

  it("空白だけの名前には改名しない", () => {
    expect(Option.isNone(spaceNameChange("   ", "仕事"))).toBe(true)
  })

  it("元と同じ名前なら改名しない", () => {
    expect(Option.isNone(spaceNameChange("仕事 ", "仕事"))).toBe(true)
  })
})

describe("tabTitleChange", () => {
  it("空にするとタブ名の上書きを解除する", () => {
    expect(Option.getOrNull(tabTitleChange("  ", "受信トレイ"))).toBe("")
  })

  it("表示中の名前から変えていなければ何もしない", () => {
    expect(Option.isNone(tabTitleChange("受信トレイ", "受信トレイ"))).toBe(true)
  })
})

describe("bookmarkTitleChange", () => {
  it("空の名前には改名しない", () => {
    expect(Option.isNone(bookmarkTitleChange("", "資料"))).toBe(true)
  })

  it("新しい名前に改名する", () => {
    expect(Option.getOrNull(bookmarkTitleChange("設計資料", "資料"))).toBe("設計資料")
  })
})
