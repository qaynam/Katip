import { Result } from "effect"
import { describe, expect, it } from "vitest"
import { GMAIL_IMPORTANT_LABEL, GMAIL_PRIMARY_LABEL } from "#modules/live-folders"
import { gitHubTokenFrom, gmailSourceFrom, type GmailDraft } from "./live-folder-drafts"

describe("gmailSourceFrom", () => {
  const draft = (overrides: Partial<GmailDraft> = {}): GmailDraft => ({
    accountIndex: "0",
    mailbox: "Primary",
    label: "",
    ...overrides,
  })
  const failureOf = (input: GmailDraft) => {
    const parsed = gmailSourceFrom(input)
    return Result.isFailure(parsed) ? parsed.failure : null
  }

  it("lists the important mail of the given account through Gmail's label for it", () => {
    expect(
      Result.getOrNull(gmailSourceFrom(draft({ accountIndex: "2", mailbox: "Important" }))),
    ).toStrictEqual({ _tag: "Gmail", accountIndex: 2, label: GMAIL_IMPORTANT_LABEL })
  })

  it("lists the Primary tab of the given account through Gmail's label for it", () => {
    expect(Result.getOrNull(gmailSourceFrom(draft({ accountIndex: "2" })))).toStrictEqual({
      _tag: "Gmail",
      accountIndex: 2,
      label: GMAIL_PRIMARY_LABEL,
    })
  })

  it("lists the whole inbox without a label, whatever was typed as one", () => {
    expect(
      Result.getOrNull(gmailSourceFrom(draft({ mailbox: "Inbox", label: "Work" }))),
    ).toMatchObject({ label: null })
  })

  it("lists the given label, without the whitespace around it", () => {
    expect(
      Result.getOrNull(gmailSourceFrom(draft({ mailbox: "Label", label: " Work " }))),
    ).toMatchObject({ label: "Work" })
  })

  it("asks for the label's name when a label is chosen without one", () => {
    expect(failureOf(draft({ mailbox: "Label", label: "   " }))).toBe("LabelRequired")
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
