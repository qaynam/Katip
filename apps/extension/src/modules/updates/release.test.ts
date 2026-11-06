import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { isLaterVersion, releaseOfResponse } from "./release"

const githubReply = (fields: Record<string, unknown>) =>
  JSON.stringify({
    tag_name: "v1.3.0",
    html_url: "https://github.com/qaynam/Katip/releases/tag/v1.3.0",
    published_at: "2026-11-20T09:00:00Z",
    name: "1.3.0",
    ...fields,
  })

describe("releaseOfResponse", () => {
  it("reads the version from the tag, with the release's page and date", () => {
    expect(releaseOfResponse(githubReply({}))).toStrictEqual(
      Option.some({
        version: "1.3.0",
        pageUrl: "https://github.com/qaynam/Katip/releases/tag/v1.3.0",
        publishedAt: "2026-11-20T09:00:00Z",
      }),
    )
  })

  it("refuses a release whose page isn't on Katip's repository", () => {
    expect(
      releaseOfResponse(githubReply({ html_url: "https://example.com/releases/tag/v1.3.0" })),
    ).toStrictEqual(Option.none())
  })

  it("refuses a release whose tag isn't a version", () => {
    expect(releaseOfResponse(githubReply({ tag_name: "nightly" }))).toStrictEqual(Option.none())
  })

  it("refuses a reply that isn't a release", () => {
    expect([
      releaseOfResponse('{"message":"Not Found"}'),
      releaseOfResponse("<html>"),
    ]).toStrictEqual([Option.none(), Option.none()])
  })
})

describe("isLaterVersion", () => {
  it.each([
    ["1.3.0", "1.2.0", true],
    ["1.10.0", "1.9.0", true],
    ["2.0", "1.99.99", true],
    ["1.2.0", "1.2.0", false],
    ["1.2", "1.2.0", false],
    ["1.1.9", "1.2.0", false],
  ])("%s is later than %s: %s", (candidate, installed, expected) => {
    expect(isLaterVersion(candidate, installed)).toBe(expected)
  })
})
