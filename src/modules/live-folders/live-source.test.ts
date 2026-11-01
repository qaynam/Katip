import { describe, expect, it } from "vitest"
import { makeTranslator } from "#modules/i18n"
import {
  defaultLiveFolderTitle,
  originPatternOf,
  signInUrlOf,
  type LiveSource,
} from "./live-source"

const ja = makeTranslator("ja")
const en = makeTranslator("en")

const gmail = (accountIndex: number, label: string | null): LiveSource => ({
  _tag: "Gmail",
  accountIndex,
  label,
})

describe("取得元に要るホストの許可", () => {
  it("Gmail は mail.google.com、GitHub はログイン中のセッションで読む github.com への許可が要る", () => {
    expect([
      originPatternOf(gmail(1, "仕事")),
      originPatternOf({ _tag: "GitHub", query: "mentioned" }),
    ]).toStrictEqual(["https://mail.google.com/*", "https://github.com/*"])
  })
})

describe("ログインのために開くページ", () => {
  it("Gmail はそのアカウントの受信トレイ、GitHub はログインページ", () => {
    expect([
      signInUrlOf(gmail(1, "仕事")),
      signInUrlOf({ _tag: "GitHub", query: "mentioned" }),
    ]).toStrictEqual(["https://mail.google.com/mail/u/1/", "https://github.com/login"])
  })
})

describe("作ったときの名前", () => {
  it("Gmail は受信トレイかラベルの名前になる", () => {
    expect([
      defaultLiveFolderTitle(gmail(0, null), ja),
      defaultLiveFolderTitle(gmail(0, "請求書"), ja),
    ]).toStrictEqual(["Gmail の受信トレイ", "Gmail の 請求書"])
  })

  it("2 つ目以降の Google アカウントは、アカウントの番号を添えて区別する", () => {
    expect(defaultLiveFolderTitle(gmail(1, null), ja)).toBe("Gmail の受信トレイ（u/1）")
  })

  it("GitHub は並べる対象の名前になる", () => {
    expect(defaultLiveFolderTitle({ _tag: "GitHub", query: "review-requested" }, ja)).toBe(
      "GitHub のレビュー依頼",
    )
  })
})

describe("作ったときの名前の言語", () => {
  it("英語に設定していれば、英語の名前を付ける", () => {
    expect([
      defaultLiveFolderTitle(gmail(1, null), en),
      defaultLiveFolderTitle({ _tag: "GitHub", query: "mentioned" }, en),
    ]).toStrictEqual(["Gmail Inbox (u/1)", "GitHub Mentions"])
  })
})
