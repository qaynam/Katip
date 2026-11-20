import { Option } from "effect"
import { describe, expect, it } from "vitest"
import type { SoundRule } from "./sound-rule"
import { ruleForSite, soundRulesOfStored, withoutRule, withRule } from "./sound-rules"
import { SoundSite } from "./sound-site"

const youtube = SoundSite.make("https://www.youtube.com")
const spotify = SoundSite.make("https://open.spotify.com")

const rule = (site: SoundSite, output: string | null): SoundRule => ({
  site,
  output,
  volume: 1,
  method: "InPage",
})

describe("soundRulesOfStored", () => {
  it("reads the saved rules", () => {
    const saved = [rule(youtube, "External Speaker")]

    expect(soundRulesOfStored(saved)).toStrictEqual(saved)
  })

  it("drops a broken rule and keeps the rest", () => {
    expect(
      soundRulesOfStored([
        { site: "not a site", output: null, volume: 1, method: "InPage" },
        rule(spotify, null),
      ]),
    ).toStrictEqual([rule(spotify, null)])
  })

  it.each([
    ["nothing saved", undefined],
    ["something that isn't a list", { site: youtube }],
  ])("is no rules for %s", (_, stored) => {
    expect(soundRulesOfStored(stored)).toStrictEqual([])
  })
})

describe("keeping a rule per site", () => {
  it("adds the rule of a site that had none", () => {
    expect(withRule([rule(spotify, null)], rule(youtube, "External Speaker"))).toStrictEqual([
      rule(spotify, null),
      rule(youtube, "External Speaker"),
    ])
  })

  it("replaces the site's rule in its place, so a site never has two", () => {
    const rules = [rule(youtube, "External Speaker"), rule(spotify, null)]

    expect(withRule(rules, rule(youtube, "MacBook Pro Speakers"))).toStrictEqual([
      rule(youtube, "MacBook Pro Speakers"),
      rule(spotify, null),
    ])
  })

  it("finds the rule of a site, and none once it's removed", () => {
    const rules = [rule(youtube, "External Speaker")]

    expect([
      ruleForSite(rules, youtube),
      ruleForSite(withoutRule(rules, youtube), youtube),
    ]).toStrictEqual([Option.some(rule(youtube, "External Speaker")), Option.none()])
  })
})
