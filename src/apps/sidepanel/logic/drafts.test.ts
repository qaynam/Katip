import { Option, Result } from "effect"
import { describe, expect, it } from "vitest"
import { bookmarkTitleChange, idleMinutesFrom, spaceNameChange, tabTitleChange } from "./drafts"

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

describe("idleMinutesFrom", () => {
  const minutesOf = (draft: string) => Result.getOrNull(idleMinutesFrom(draft))
  const reasonOf = (draft: string) => {
    const parsed = idleMinutesFrom(draft)
    return Result.isFailure(parsed) ? parsed.failure : null
  }

  it("1 分以上の整数を受け付ける", () => {
    expect(minutesOf("1")).toBe(1)
    expect(minutesOf(" 90 ")).toBe(90)
  })

  it("空なら、分数の入力を求める", () => {
    expect(reasonOf("  ")).toBe("分数を入力してください")
  })

  it("整数でなければ、整数での入力を求める", () => {
    expect(reasonOf("1.5")).toBe("分は整数で入力してください")
    expect(reasonOf("abc")).toBe("分は整数で入力してください")
  })

  it("1 分未満なら、1 分以上を求める", () => {
    expect(reasonOf("0")).toBe("1 分以上にしてください")
    expect(reasonOf("-3")).toBe("1 分以上にしてください")
  })
})
