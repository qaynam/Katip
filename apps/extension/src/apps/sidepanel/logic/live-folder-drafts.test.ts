import { Result } from "effect"
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

  it("uses the given label of the given account as the source", () => {
    expect(
      Result.getOrNull(gmailSourceFrom(draft({ accountIndex: "2", label: "Work" }))),
    ).toStrictEqual({ _tag: "Gmail", accountIndex: 2, label: "Work" })
  })

  it("uses the inbox as the source when the label is empty", () => {
    expect(Result.getOrNull(gmailSourceFrom(draft({ label: "   " })))).toStrictEqual({
      _tag: "Gmail",
      accountIndex: 0,
      label: null,
    })
  })

  it("treats an empty account number as the first signed-in account (0)", () => {
    expect(Result.getOrNull(gmailSourceFrom(draft({ accountIndex: " " })))).toMatchObject({
      accountIndex: 0,
    })
  })

  it("reads full-width digits and surrounding whitespace as an account number", () => {
    expect(Result.getOrNull(gmailSourceFrom(draft({ accountIndex: " １ " })))).toMatchObject({
      accountIndex: 1,
    })
  })

  it("rejects negative, fractional, and non-numeric account numbers", () => {
    expect(failureOf(draft({ accountIndex: "-1" }))).toBe("InvalidAccountIndex")
    expect(failureOf(draft({ accountIndex: "1.5" }))).toBe("InvalidAccountIndex")
    expect(failureOf(draft({ accountIndex: "abc" }))).toBe("InvalidAccountIndex")
    expect(failureOf(draft({ accountIndex: "1e2" }))).toBe("InvalidAccountIndex")
  })
})

describe("gitHubTokenFrom", () => {
  const failureOf = (input: string) => {
    const parsed = gitHubTokenFrom(input)
    return Result.isFailure(parsed) ? parsed.failure : null
  }

  it("trims surrounding whitespace from the token", () => {
    expect(Result.getOrNull(gitHubTokenFrom("  ghp_abc  "))).toBe("ghp_abc")
  })

  it("asks for a token when empty", () => {
    expect(failureOf("  ")).toBe("TokenRequired")
  })

  it("rejects a token with whitespace inside", () => {
    expect(failureOf("ghp_abc def")).toBe("TokenHasWhitespace")
  })
})
