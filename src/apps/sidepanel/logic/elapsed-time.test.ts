import { describe, expect, it } from "vitest"
import { describeElapsed } from "./elapsed-time"

const now = new Date(2026, 9, 30, 12, 0).getTime()
const minutes = (value: number) => value * 60_000

describe("describeElapsed", () => {
  it("1 分未満は「たった今」と表す", () => {
    expect(describeElapsed(now - 59_000, now)).toBe("たった今")
  })

  it("1 時間未満は分で、1 日未満は時間で表す", () => {
    expect(describeElapsed(now - minutes(5), now)).toBe("5 分前")
    expect(describeElapsed(now - minutes(150), now)).toBe("2 時間前")
  })

  it("1 週間未満は日数で表す", () => {
    expect(describeElapsed(now - minutes(60 * 24 * 3), now)).toBe("3 日前")
  })

  it("1 週間以上前は日付で表す", () => {
    expect(describeElapsed(new Date(2026, 9, 1).getTime(), now)).toBe("10/1")
  })

  it("時計のずれで未来の時刻になっていても「たった今」と表す", () => {
    expect(describeElapsed(now + minutes(3), now)).toBe("たった今")
  })
})
