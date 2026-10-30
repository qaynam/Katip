import { describe, expect, it } from "vitest"
import { defaultLiveFolderTitle, originPatternOf, type LiveSource } from "./live-source"

const gmail = (accountIndex: number, label: string | null): LiveSource => ({
  _tag: "Gmail",
  accountIndex,
  label,
})

describe("取得元に要るホストの許可", () => {
  it("Gmail は mail.google.com、GitHub は api.github.com への許可が要る", () => {
    expect([
      originPatternOf(gmail(1, "仕事")),
      originPatternOf({ _tag: "GitHub", query: "mentioned" }),
    ]).toStrictEqual(["https://mail.google.com/*", "https://api.github.com/*"])
  })
})

describe("作ったときの名前", () => {
  it("Gmail は受信トレイかラベルの名前になる", () => {
    expect([
      defaultLiveFolderTitle(gmail(0, null)),
      defaultLiveFolderTitle(gmail(0, "請求書")),
    ]).toStrictEqual(["Gmail の受信トレイ", "Gmail の 請求書"])
  })

  it("2 つ目以降の Google アカウントは、アカウントの番号を添えて区別する", () => {
    expect(defaultLiveFolderTitle(gmail(1, null))).toBe("Gmail の受信トレイ（u/1）")
  })

  it("GitHub は並べる対象の名前になる", () => {
    expect(defaultLiveFolderTitle({ _tag: "GitHub", query: "review-requested" })).toBe(
      "GitHub のレビュー依頼",
    )
  })
})
