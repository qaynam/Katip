import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { bangRequestsIn, inputForTrigger, triggerBeingTyped } from "./bang-input"

describe("the bangs written in an input", () => {
  it("are found before the query, with the query after them", () => {
    expect(bangRequestsIn("!gh effect  ts")).toStrictEqual([{ trigger: "gh", query: "effect ts" }])
  })

  it("are found after the query too", () => {
    expect(bangRequestsIn("effect ts !gh")).toStrictEqual([{ trigger: "gh", query: "effect ts" }])
  })

  it("are lowercase whatever case they were typed in", () => {
    expect(bangRequestsIn("!GH katip")).toStrictEqual([{ trigger: "gh", query: "katip" }])
  })

  it("can be on their own, with nothing to search for", () => {
    expect(bangRequestsIn(" !gh ")).toStrictEqual([{ trigger: "gh", query: "" }])
  })

  it("are each listed in the order written, with the other words as the query", () => {
    expect(bangRequestsIn("!w cats !gh")).toStrictEqual([
      { trigger: "w", query: "cats !gh" },
      { trigger: "gh", query: "!w cats" },
    ])
  })

  it("leave out a ! alone and one in the middle of a word", () => {
    expect(bangRequestsIn("hello ! world wow!gh")).toStrictEqual([])
  })
})

describe("the trigger being typed", () => {
  it("is what follows ! when that is all the input holds", () => {
    expect(triggerBeingTyped("  !Gh")).toStrictEqual(Option.some("gh"))
  })

  it("is empty for ! alone", () => {
    expect(triggerBeingTyped("!")).toStrictEqual(Option.some(""))
  })

  it("is none once a space follows it, or when other words come before it", () => {
    expect([triggerBeingTyped("!gh "), triggerBeingTyped("katip !gh")]).toStrictEqual([
      Option.none(),
      Option.none(),
    ])
  })
})

describe("the input that sets up a bang's search", () => {
  it("is the bang followed by a space, ready for the query", () => {
    expect(inputForTrigger("gh")).toBe("!gh ")
  })
})
