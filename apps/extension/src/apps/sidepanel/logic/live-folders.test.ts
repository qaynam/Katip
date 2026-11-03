import { describe, expect, it } from "vitest"
import { liveItem, pinnedLiveFolder } from "../testing/view-builders"
import { sourceOrigins, unseenBadgeText, unseenCount } from "./live-folders"

describe("unseenCount", () => {
  it("counts only the items not opened yet", () => {
    const folder = pinnedLiveFolder("inbox", {
      items: [
        liveItem("a", { isUnseen: true }),
        liveItem("b", { isUnseen: false }),
        liveItem("c", { isUnseen: true }),
      ],
    })

    expect(unseenCount(folder)).toBe(2)
  })

  it("is 0 when there are no items", () => {
    expect(unseenCount(pinnedLiveFolder("inbox", { items: [] }))).toBe(0)
  })
})

describe("unseenBadgeText", () => {
  it("shows counts up to 99 as they are", () => {
    expect(unseenBadgeText(1)).toBe("1")
    expect(unseenBadgeText(99)).toBe("99")
  })

  it("caps counts of 100 or more at 99+", () => {
    expect(unseenBadgeText(100)).toBe("99+")
  })
})

describe("sourceOrigins", () => {
  it("asks for access to mail.google.com for Gmail", () => {
    expect(sourceOrigins("Gmail")).toStrictEqual(["https://mail.google.com/*"])
  })

  it("asks for access to github.com for GitHub, which uses the browser's sign-in", () => {
    expect(sourceOrigins("GitHub")).toStrictEqual(["https://github.com/*"])
  })
})
