import { describe, expect, it } from "vitest"
import { makeTranslator } from "#modules/i18n"
import { explainFailure, type LiveFetchFailure } from "./live-fetch-failure"
import type { LiveSource } from "./live-source"

const gmail: LiveSource = { _tag: "Gmail", accountIndex: 2, label: null }
const github: LiveSource = { _tag: "GitHub", query: "review-requested" }
const ja = makeTranslator("ja")
const en = makeTranslator("en")

const fixesOf = (failure: LiveFetchFailure, source: LiveSource = github) => {
  const { needsPermission, needsToken, signInUrl } = explainFailure(failure, source, ja)
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
    expect(explainFailure({ _tag: "NotSignedIn" }, gmail, ja)).toStrictEqual({
      reason: "このアカウントで Gmail にログインしていません",
      needsPermission: false,
      needsToken: false,
      signInUrl: "https://mail.google.com/mail/u/2/",
    })
  })

  it("GitHub にログインしていなければ、ログインページを開けば直ると示す", () => {
    expect(explainFailure({ _tag: "NotSignedIn" }, github, ja)).toStrictEqual({
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
    expect(explainFailure({ _tag: "UnreadableResponse" }, github, ja).reason).toBe(
      "GitHub の応答を読み取れませんでした",
    )
  })

  it("状態コードで失敗したなら、理由にその状態コードを含める", () => {
    expect(explainFailure({ _tag: "UnexpectedStatus", status: 502 }, gmail, ja).reason).toContain(
      "502",
    )
  })
})

describe("表示の言語", () => {
  it("英語に設定していれば、理由を英語で説明する", () => {
    expect(explainFailure({ _tag: "NotSignedIn" }, github, en).reason).toBe(
      "You aren't signed in to GitHub",
    )
  })

  it("理由に取得元の名前と状態コードを埋め込む", () => {
    expect([
      explainFailure({ _tag: "RateLimited", retryAt: 0 }, github, en).reason,
      explainFailure({ _tag: "UnexpectedStatus", status: 502 }, gmail, en).reason,
    ]).toStrictEqual([
      "GitHub usage limit reached. Katip will try again later",
      "Couldn't fetch the items (HTTP 502)",
    ])
  })
})
