import { describe, expect, it } from "vitest"
import { readableUrl } from "./readable-url"

describe("readableUrl", () => {
  it("drops the http(s) scheme, www. and a trailing /", () => {
    expect(readableUrl("https://www.example.com/docs/")).toBe("example.com/docs")
  })

  it("keeps any other scheme", () => {
    expect(readableUrl("chrome://settings/")).toBe("chrome://settings")
  })
})
