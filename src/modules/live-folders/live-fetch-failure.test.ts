import { describe, expect, it } from "vitest"
import { explainFailure, type LiveFetchFailure } from "./live-fetch-failure"

const fixesOf = (failure: LiveFetchFailure) => {
  const { needsPermission, needsToken } = explainFailure(failure)
  return { needsPermission, needsToken }
}

describe("失敗の説明", () => {
  it("アクセスの許可が無ければ、許可を求めれば直ると示す", () => {
    expect(fixesOf({ _tag: "PermissionMissing" })).toStrictEqual({
      needsPermission: true,
      needsToken: false,
    })
  })

  it("トークンが無いか無効なら、トークンを入れ直せば直ると示す", () => {
    expect([fixesOf({ _tag: "TokenMissing" }), fixesOf({ _tag: "TokenRejected" })]).toStrictEqual([
      { needsPermission: false, needsToken: true },
      { needsPermission: false, needsToken: true },
    ])
  })

  it("ユーザーの操作では直らない失敗は、どちらも示さない", () => {
    const failures: ReadonlyArray<LiveFetchFailure> = [
      { _tag: "NotSignedIn" },
      { _tag: "AccessDenied", status: 403 },
      { _tag: "RateLimited", retryAt: 0 },
      { _tag: "Unreachable" },
      { _tag: "UnexpectedStatus", status: 500 },
      { _tag: "UnreadableResponse" },
    ]

    expect(failures.map(fixesOf)).toStrictEqual(
      failures.map(() => ({ needsPermission: false, needsToken: false })),
    )
  })

  it("状態コードで失敗したなら、理由にその状態コードを含める", () => {
    expect(explainFailure({ _tag: "UnexpectedStatus", status: 502 }).reason).toContain("502")
  })
})
