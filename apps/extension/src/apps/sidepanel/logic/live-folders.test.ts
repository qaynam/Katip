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

  it("counts the unread items the folder's limit holds back too, so the count tells there are more", () => {
    const folder = pinnedLiveFolder("inbox", {
      limit: 5,
      items: Array.from({ length: 5 }, (_, index) =>
        liveItem(`shown-${index}`, { isUnseen: true }),
      ),
      hiddenItems: [
        liveItem("hidden-unread", { isUnseen: true }),
        liveItem("hidden-read", { isUnseen: false }),
      ],
    })

    expect(unseenCount(folder)).toBe(6)
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
    expect(sourceOrigins({ _tag: "Gmail", accountIndex: 0, label: null })).toStrictEqual([
      "https://mail.google.com/*",
    ])
  })

  it("asks for access to github.com for GitHub's searches and notifications, which use the browser's sign-in", () => {
    expect([
      sourceOrigins({ _tag: "GitHub", query: "mentioned" }),
      sourceOrigins({ _tag: "GitHub", query: "notifications" }),
    ]).toStrictEqual([["https://github.com/*"], ["https://github.com/*"]])
  })
})
