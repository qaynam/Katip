import { describe, expect, it } from "vitest"
import { exportFileName } from "./file-name"

describe("the export file name", () => {
  it("contains the day of the export as dated in this environment's time zone", () => {
    expect(exportFileName(new Date(2026, 10, 2, 23, 59))).toBe("katip-export-2026-11-02.json")
  })

  it("writes the month and the day with two digits", () => {
    expect(exportFileName(new Date(2027, 0, 5))).toBe("katip-export-2027-01-05.json")
  })
})
