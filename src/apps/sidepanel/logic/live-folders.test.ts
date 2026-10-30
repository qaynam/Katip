import { describe, expect, it } from "vitest"
import { liveItem, pinnedLiveFolder } from "../testing/view-builders"
import { sourceOrigins, unseenBadgeText, unseenCount } from "./live-folders"

describe("unseenCount", () => {
  it("まだ開いていない項目だけを数える", () => {
    const folder = pinnedLiveFolder("inbox", {
      items: [
        liveItem("a", { isUnseen: true }),
        liveItem("b", { isUnseen: false }),
        liveItem("c", { isUnseen: true }),
      ],
    })

    expect(unseenCount(folder)).toBe(2)
  })

  it("項目が無ければ 0 件", () => {
    expect(unseenCount(pinnedLiveFolder("inbox", { items: [] }))).toBe(0)
  })
})

describe("unseenBadgeText", () => {
  it("99 件までは件数をそのまま出す", () => {
    expect(unseenBadgeText(1)).toBe("1")
    expect(unseenBadgeText(99)).toBe("99")
  })

  it("100 件以上は「99+」にまとめる", () => {
    expect(unseenBadgeText(100)).toBe("99+")
  })
})

describe("sourceOrigins", () => {
  it("Gmail は mail.google.com へのアクセスを求める", () => {
    expect(sourceOrigins("Gmail")).toStrictEqual(["https://mail.google.com/*"])
  })

  it("GitHub はブラウザのログインを使うので github.com へのアクセスを求める", () => {
    expect(sourceOrigins("GitHub")).toStrictEqual(["https://github.com/*"])
  })
})
