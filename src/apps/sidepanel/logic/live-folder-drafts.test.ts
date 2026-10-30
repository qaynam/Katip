import { Option, Result } from "effect"
import { describe, expect, it } from "vitest"
import { gitHubTokenFrom, gmailSourceFrom, type GmailDraft } from "./live-folder-drafts"

describe("gmailSourceFrom", () => {
  const draft = (overrides: Partial<GmailDraft> = {}): GmailDraft => ({
    accountIndex: "0",
    label: "",
    ...overrides,
  })
  const failureOf = (input: GmailDraft) => {
    const parsed = gmailSourceFrom(input)
    return Result.isFailure(parsed) ? parsed.failure : null
  }

  it("番号とラベルから、そのアカウントのそのラベルを取得元にする", () => {
    expect(
      Result.getOrNull(gmailSourceFrom(draft({ accountIndex: "2", label: "仕事" }))),
    ).toStrictEqual({ _tag: "Gmail", accountIndex: 2, label: "仕事" })
  })

  it("ラベルが空なら受信トレイを取得元にする", () => {
    expect(Result.getOrNull(gmailSourceFrom(draft({ label: "   " })))).toStrictEqual({
      _tag: "Gmail",
      accountIndex: 0,
      label: null,
    })
  })

  it("番号が空なら、最初にログインしたアカウント（0）とみなす", () => {
    expect(Result.getOrNull(gmailSourceFrom(draft({ accountIndex: " " })))).toMatchObject({
      accountIndex: 0,
    })
  })

  it("全角の数字や前後の空白があっても番号として読む", () => {
    expect(Result.getOrNull(gmailSourceFrom(draft({ accountIndex: " １ " })))).toMatchObject({
      accountIndex: 1,
    })
  })

  it("負の数・小数・数字以外の番号は受け付けない", () => {
    expect(failureOf(draft({ accountIndex: "-1" }))).toBe("InvalidAccountIndex")
    expect(failureOf(draft({ accountIndex: "1.5" }))).toBe("InvalidAccountIndex")
    expect(failureOf(draft({ accountIndex: "abc" }))).toBe("InvalidAccountIndex")
    expect(failureOf(draft({ accountIndex: "1e2" }))).toBe("InvalidAccountIndex")
  })
})

describe("gitHubTokenFrom", () => {
  const failureOf = (input: string, requirement: "required" | "optional") => {
    const parsed = gitHubTokenFrom(input, requirement)
    return Result.isFailure(parsed) ? parsed.failure : null
  }

  it("前後の空白を除いたトークンを送る", () => {
    expect(Result.getOrNull(gitHubTokenFrom("  ghp_abc  ", "required"))).toStrictEqual(
      Option.some("ghp_abc"),
    )
  })

  it("必須の欄が空ならトークンの入力を求める", () => {
    expect(failureOf("  ", "required")).toBe("TokenRequired")
  })

  it("任意の欄が空ならトークンを送らない", () => {
    expect(Result.getOrNull(gitHubTokenFrom("", "optional"))).toStrictEqual(Option.none())
  })

  it("途中に空白を含むトークンは受け付けない", () => {
    expect(failureOf("ghp_abc def", "optional")).toBe("TokenHasWhitespace")
  })
})
