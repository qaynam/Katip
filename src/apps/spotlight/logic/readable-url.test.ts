import { describe, expect, it } from "vitest"
import { readableUrl } from "./readable-url"

describe("一覧に出す URL", () => {
  it("http(s) の scheme、www.、末尾の / を除く", () => {
    expect(readableUrl("https://www.example.com/docs/")).toBe("example.com/docs")
  })

  it("ほかの scheme はそのまま出す", () => {
    expect(readableUrl("chrome://settings/")).toBe("chrome://settings")
  })
})
