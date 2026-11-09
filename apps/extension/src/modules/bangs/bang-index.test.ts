import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { type Bang, DEFAULT_BANG_FORMAT } from "./bang"
import { bangIndexOf, layeredIndex } from "./bang-index"

const bang = (name: string, ...triggers: [string, ...Array<string>]): Bang => ({
  name,
  triggers,
  template: `https://${name.toLowerCase()}.example/?q=%s`,
  format: DEFAULT_BANG_FORMAT,
})

const github = bang("GitHub", "gh", "git", "github")
const gmail = bang("Gmail", "gmail")
const google = bang("Google", "g", "goog", "google")
const gitlab = bang("GitLab", "gl", "gitlab")

const names = (matches: ReadonlyArray<{ bang: Bang; trigger: string }>) =>
  matches.map((match) => `${match.bang.name} !${match.trigger}`)

describe("finding a bang by its trigger", () => {
  const index = bangIndexOf([github, google])

  it("finds the bang any of its triggers stands for", () => {
    expect([index.find("gh"), index.find("github")]).toStrictEqual([
      Option.some(github),
      Option.some(github),
    ])
  })

  it("finds nothing for a trigger no bang has", () => {
    expect(index.find("gx")).toStrictEqual(Option.none())
  })

  it("gives a trigger two bangs share to the one listed first", () => {
    const rival = bang("Rival", "gh")

    expect(bangIndexOf([rival, github]).find("gh")).toStrictEqual(Option.some(rival))
  })
})

describe("the bangs a trigger being typed can become", () => {
  const index = bangIndexOf([gitlab, gmail, github, google])

  it("lists the exact trigger first, then shorter triggers before longer ones", () => {
    expect(names(index.startingWith("g", 10))).toStrictEqual([
      "Google !g",
      "GitHub !gh",
      "GitLab !gl",
      "Gmail !gmail",
    ])
  })

  it("among triggers of the same length, lists a bang with more triggers first", () => {
    const y8 = bang("Y8", "y8")
    const youtube = bang("YouTube", "yt", "you", "youtube")

    expect(names(bangIndexOf([y8, youtube]).startingWith("y", 10))).toStrictEqual([
      "YouTube !yt",
      "Y8 !y8",
    ])
  })

  it("lists each bang once, with its shortest trigger that matches", () => {
    expect(names(index.startingWith("git", 10))).toStrictEqual(["GitHub !git", "GitLab !gitlab"])
  })

  it("lists no more than the limit", () => {
    expect(index.startingWith("g", 2)).toHaveLength(2)
  })

  it("lists none when no trigger starts that way", () => {
    expect(index.startingWith("zz", 10)).toStrictEqual([])
  })
})

describe("bangs layered over others", () => {
  const mine = bang("My GitHub", "gh")
  const work = bang("Work Wiki", "gw")
  const index = layeredIndex(bangIndexOf([mine, work]), bangIndexOf([github, google]))

  it("take a trigger both have", () => {
    expect(index.find("gh")).toStrictEqual(Option.some(mine))
  })

  it("leave the triggers only the others have to them", () => {
    expect(index.find("google")).toStrictEqual(Option.some(google))
  })

  it("are listed among the others by how well they match, the layered one first on a tie", () => {
    expect(names(index.startingWith("g", 10))).toStrictEqual([
      "Google !g",
      "My GitHub !gh",
      "Work Wiki !gw",
      "GitHub !git",
    ])
  })
})
