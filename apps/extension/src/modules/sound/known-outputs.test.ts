import { describe, expect, it } from "vitest"
import { knownOutputsOfStored, withOutputsNoted } from "./known-outputs"

describe("withOutputsNoted", () => {
  it("adds the names not known yet after the known ones, keeping one of each", () => {
    expect(
      withOutputsNoted(["MacBook Pro Speakers"], ["External Speaker", "MacBook Pro Speakers"]),
    ).toStrictEqual(["MacBook Pro Speakers", "External Speaker"])
  })

  it("keeps a name no longer seen, so a disconnected output can still be chosen", () => {
    expect(
      withOutputsNoted(["MacBook Pro Speakers", "External Speaker"], ["MacBook Pro Speakers"]),
    ).toStrictEqual(["MacBook Pro Speakers", "External Speaker"])
  })
})

describe("knownOutputsOfStored", () => {
  it.each([
    ["nothing saved", undefined, []],
    ["something that isn't a list", "External Speaker", []],
    [
      "a list with what isn't a name",
      ["External Speaker", 3, "", "External Speaker"],
      ["External Speaker"],
    ],
  ])("reads %s as the names it holds", (_, stored, expected) => {
    expect(knownOutputsOfStored(stored)).toStrictEqual(expected)
  })
})
