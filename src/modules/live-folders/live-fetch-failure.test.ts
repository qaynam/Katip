import { describe, expect, it } from "vitest"
import { makeTranslator } from "#modules/i18n"
import { explainFailure, type LiveFetchFailure } from "./live-fetch-failure"
import type { LiveSource } from "./live-source"

const gmail: LiveSource = { _tag: "Gmail", accountIndex: 2, label: null }
const github: LiveSource = { _tag: "GitHub", query: "review-requested" }
const en = makeTranslator("en")
const ja = makeTranslator("ja")

const fixesOf = (failure: LiveFetchFailure, source: LiveSource = github) => {
  const { needsPermission, needsToken, signInUrl } = explainFailure(failure, source, en)
  return { needsPermission, needsToken, signInUrl }
}

describe("explaining a failure", () => {
  it("without access permission, says asking for the permission fixes it", () => {
    expect(fixesOf({ _tag: "PermissionMissing" })).toStrictEqual({
      needsPermission: true,
      needsToken: false,
      signInUrl: null,
    })
  })

  it("with an invalid token, says entering the token again fixes it", () => {
    expect(fixesOf({ _tag: "TokenRejected" })).toStrictEqual({
      needsPermission: false,
      needsToken: true,
      signInUrl: null,
    })
  })

  it("signed out of Gmail, says opening that account's inbox and signing in fixes it", () => {
    expect(explainFailure({ _tag: "NotSignedIn" }, gmail, en)).toStrictEqual({
      reason: "You aren't signed in to Gmail with this account",
      needsPermission: false,
      needsToken: false,
      signInUrl: "https://mail.google.com/mail/u/2/",
    })
  })

  it("signed out of GitHub, says opening the sign-in page fixes it", () => {
    expect(explainFailure({ _tag: "NotSignedIn" }, github, en)).toStrictEqual({
      reason: "You aren't signed in to GitHub",
      needsPermission: false,
      needsToken: false,
      signInUrl: "https://github.com/login",
    })
  })

  it("offers no fix for a failure the user can't fix", () => {
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

  it("for an unreadable response, names the source it came from", () => {
    expect(explainFailure({ _tag: "UnreadableResponse" }, github, en).reason).toBe(
      "Couldn't read the response from GitHub",
    )
  })

  it("for a failure with a status code, includes the status code in the reason", () => {
    expect(explainFailure({ _tag: "UnexpectedStatus", status: 502 }, gmail, en).reason).toContain(
      "502",
    )
  })
})

describe("language of the explanation", () => {
  it("explains the reason in the translator's language", () => {
    expect(explainFailure({ _tag: "NotSignedIn" }, github, ja).reason).toBe(
      "GitHub にログインしていません",
    )
  })

  it("fills the source's name and the status code into the reason", () => {
    expect([
      explainFailure({ _tag: "RateLimited", retryAt: 0 }, github, en).reason,
      explainFailure({ _tag: "UnexpectedStatus", status: 502 }, gmail, en).reason,
    ]).toStrictEqual([
      "GitHub usage limit reached. Katip will try again later",
      "Couldn't fetch the items (HTTP 502)",
    ])
  })
})
