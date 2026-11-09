import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { type Bang, DEFAULT_BANG_FORMAT } from "./bang"
import { bangIndexOf } from "./bang-index"
import { bangSearchIn, bangSuggestionsFor } from "./bang-lookup"

const bang = (name: string, template: string, ...triggers: [string, ...Array<string>]): Bang => ({
  name,
  triggers,
  template,
  format: DEFAULT_BANG_FORMAT,
})

const github = bang("GitHub", "https://github.com/search?q=%s", "gh", "github")
const gitlab = bang("GitLab", "https://gitlab.com/search?search=%s", "gl", "gitlab")
const wikipedia = bang("Wikipedia", "https://wikipedia.org/w/index.php?search=%s", "w")
const index = bangIndexOf([github, gitlab, wikipedia])

describe("the site search an input asks for", () => {
  it("is the bang written in it, searching for the rest", () => {
    expect(bangSearchIn("effect ts !gh", index)).toStrictEqual(
      Option.some({
        bang: github,
        query: "effect ts",
        url: "https://github.com/search?q=effect+ts",
      }),
    )
  })

  it("opens the site when the bang is all that was typed", () => {
    expect(Option.map(bangSearchIn("!gh", index), (search) => search.url)).toStrictEqual(
      Option.some("https://github.com/"),
    )
  })

  it("is the first bang the index knows, when several are written", () => {
    expect(Option.map(bangSearchIn("!nope cats !w", index), (search) => search.url)).toStrictEqual(
      Option.some("https://wikipedia.org/w/index.php?search=!nope+cats"),
    )
  })

  it("is none when no bang written is known", () => {
    expect(bangSearchIn("!nope cats", index)).toStrictEqual(Option.none())
  })
})

describe("the bangs suggested while a trigger is typed", () => {
  it("are those whose trigger starts with what follows the !", () => {
    expect(bangSuggestionsFor("!g", index, 5).map((match) => match.trigger)).toStrictEqual([
      "gh",
      "gl",
    ])
  })

  it("are none for ! alone, which every bang would match", () => {
    expect(bangSuggestionsFor("!", index, 5)).toStrictEqual([])
  })

  it("are none once the query is being typed", () => {
    expect(bangSuggestionsFor("!g cats", index, 5)).toStrictEqual([])
  })
})
