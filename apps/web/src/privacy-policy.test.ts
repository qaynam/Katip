import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { splitPrivacyPolicy } from "./privacy-policy.ts"

const PRIVACY_MD = readFileSync(new URL("../../../PRIVACY.md", import.meta.url), "utf8")

describe("splitPrivacyPolicy", () => {
  it("finds the English and the Japanese policy in PRIVACY.md", () => {
    const policy = splitPrivacyPolicy(PRIVACY_MD)

    expect(policy.en).toMatch(/^_Last updated: /)
    expect(policy.en).toContain("## What Katip does not do")
    expect(policy.ja).toMatch(/^_最終更新: /)
    expect(policy.ja).toContain("## しないこと")
  })

  it("leaves the titles out, and nothing of one language in the other", () => {
    const policy = splitPrivacyPolicy(PRIVACY_MD)

    expect(policy.en).not.toMatch(/^# /m)
    expect(policy.ja).not.toMatch(/^# /m)
    expect(policy.en).not.toContain("最終更新")
    expect(policy.ja).not.toContain("Last updated")
  })

  it("keeps --- that isn't on a line of its own", () => {
    const policy = splitPrivacyPolicy("# A\n\nOne --- two\n\n---\n\n# B\n\nThree")

    expect(policy).toEqual({ en: "One --- two", ja: "Three" })
  })

  it("refuses a file that doesn't hold one policy per language", () => {
    expect(() => splitPrivacyPolicy("# Privacy Policy\n\nOnly English")).toThrow(/2 policies/)
    expect(() => splitPrivacyPolicy("# A\n\na\n\n---\n\n# B\n\nb\n\n---\n\nc")).toThrow(
      /has 3 parts/,
    )
    expect(() => splitPrivacyPolicy("# A\n\na\n\n---\n\n# B")).toThrow(/2 policies/)
  })
})
