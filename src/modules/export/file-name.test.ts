import { describe, expect, it } from "vitest"
import { exportFileName } from "./file-name"

describe("書き出したファイルの名前", () => {
  it("書き出した日の、この環境の時刻帯での日付を名前に入れる", () => {
    expect(exportFileName(new Date(2026, 10, 2, 23, 59))).toBe("katip-export-2026-11-02.json")
  })

  it("月と日は 2 桁にそろえる", () => {
    expect(exportFileName(new Date(2027, 0, 5))).toBe("katip-export-2027-01-05.json")
  })
})
