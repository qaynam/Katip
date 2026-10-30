import { describe, expect, it } from "vitest"
import { explainFailure, type LiveFetchFailure } from "./live-fetch-failure"
import type { LiveSource } from "./live-source"

const gmail: LiveSource = { _tag: "Gmail", accountIndex: 2, label: null }
const github: LiveSource = { _tag: "GitHub", query: "review-requested" }

const fixesOf = (failure: LiveFetchFailure, source: LiveSource = github) => {
  const { needsPermission, needsToken, signInUrl } = explainFailure(failure, source)
  return { needsPermission, needsToken, signInUrl }
}

describe("失敗の説明", () => {
  it("アクセスの許可が無ければ、許可を求めれば直ると示す", () => {
    expect(fixesOf({ _tag: "PermissionMissing" })).toStrictEqual({
      needsPermission: true,
      needsToken: false,
      signInUrl: null,
    })
  })

  it("設定されたトークンが無効なら、トークンを入れ直せば直ると示す", () => {
    expect(fixesOf({ _tag: "TokenRejected" })).toStrictEqual({
      needsPermission: false,
      needsToken: true,
      signInUrl: null,
    })
  })

  it("Gmail にログインしていなければ、そのアカウントの受信トレイを開いてログインすれば直ると示す", () => {
    expect(explainFailure({ _tag: "NotSignedIn" }, gmail)).toStrictEqual({
      reason: "このアカウントで Gmail にログインしていません",
      needsPermission: false,
      needsToken: false,
      signInUrl: "https://mail.google.com/mail/u/2/",
    })
  })

  it("GitHub にログインしていなければ、ログインページを開けば直ると示す", () => {
    expect(explainFailure({ _tag: "NotSignedIn" }, github)).toStrictEqual({
      reason: "GitHub にログインしていません",
      needsPermission: false,
      needsToken: false,
      signInUrl: "https://github.com/login",
    })
  })

  it("ユーザーの操作では直らない失敗は、直し方を示さない", () => {
    const failures: ReadonlyArray<LiveFetchFailure> = [
      { _tag: "AccessDenied", status: 403 },
      { _tag: "RateLimited", retryAt: 0 },
      { _tag: "Unreachable" },
      { _tag: "UnexpectedStatus", status: 500 },
      { _tag: "UnreadableResponse" },
    ]

    expect(failures.map((failure) => fixesOf(failure))).toStrictEqual(
      failures.map(() => ({ needsPermission: false, needsToken: false, signInUrl: null })),
    )
  })

  it("応答を読み取れなければ、どの取得元の応答かを示す", () => {
    expect(explainFailure({ _tag: "UnreadableResponse" }, github).reason).toBe(
      "GitHub の応答を読み取れませんでした",
    )
  })

  it("状態コードで失敗したなら、理由にその状態コードを含める", () => {
    expect(explainFailure({ _tag: "UnexpectedStatus", status: 502 }, gmail).reason).toContain("502")
  })
})
