import { describe, expect, it } from "vitest"
import { type Bang, DEFAULT_BANG_FORMAT } from "./bang"
import { searchBangs } from "./bang-search"

const bang = (name: string, template: string, ...triggers: [string, ...Array<string>]): Bang => ({
  name,
  triggers,
  template,
  format: DEFAULT_BANG_FORMAT,
})

const github = bang("GitHub", "https://github.com/search?q=%s", "gh", "github")
const githubGist = bang("GitHub Gist", "https://gist.github.com/search?q=%s", "gist")
const linear = bang("Linear", "https://linear.app/search?q=%s", "lin")
const mdn = bang("MDN Web Docs", "https://developer.mozilla.org/search?q=%s", "mdn")

const names = (bangs: ReadonlyArray<Bang>) => bangs.map((found) => found.name)

describe("searching the bangs", () => {
  const bangs = [githubGist, mdn, linear, github]

  it("finds bangs by the start of their name, the shortest name first", () => {
    expect(names(searchBangs(bangs, "git", 10))).toStrictEqual(["GitHub", "GitHub Gist"])
  })

  it("finds a bang by a word of its name", () => {
    expect(names(searchBangs(bangs, "docs", 10))).toStrictEqual(["MDN Web Docs"])
  })

  it("finds a bang by its host name", () => {
    expect(names(searchBangs(bangs, "mozilla", 10))).toStrictEqual(["MDN Web Docs"])
  })

  it("puts a bang whose trigger was typed in full first, with or without the !", () => {
    expect([
      names(searchBangs(bangs, "gist", 10)),
      names(searchBangs(bangs, "!gist", 10)),
    ]).toStrictEqual([["GitHub Gist"], ["GitHub Gist"]])
  })

  it("ignores case", () => {
    expect(names(searchBangs(bangs, "LINEAR", 10))).toStrictEqual(["Linear"])
  })

  it("finds nothing for a blank text", () => {
    expect(searchBangs(bangs, "  ", 10)).toStrictEqual([])
  })

  it("lists no more than the limit", () => {
    expect(searchBangs(bangs, "git", 1)).toHaveLength(1)
  })
})
