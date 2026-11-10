import { describe, expect, it } from "vitest"
import { isOptional, ONBOARDING_STEPS, stepAfter, stepAfterSkipping, stepBefore } from "./steps"

describe("the onboarding steps", () => {
  it("set Katip up first, then show around what is worth knowing, and end", () => {
    expect(ONBOARDING_STEPS).toStrictEqual([
      "Welcome",
      "SidePanel",
      "Shortcuts",
      "ArcImport",
      "Favorites",
      "Themes",
      "LiveFolders",
      "Bangs",
      "Done",
    ])
  })

  it("let only the tour after setting up be skipped", () => {
    expect(ONBOARDING_STEPS.filter(isOptional)).toStrictEqual([
      "ArcImport",
      "Favorites",
      "Themes",
      "LiveFolders",
      "Bangs",
    ])
  })
})

describe("moving between the steps", () => {
  it("goes on to the next step, and back to the one before", () => {
    expect([stepAfter("Shortcuts"), stepBefore("Shortcuts")]).toStrictEqual([
      "ArcImport",
      "SidePanel",
    ])
  })

  it("goes nowhere before the first step or after the last", () => {
    expect([stepBefore("Welcome"), stepAfter("Done")]).toStrictEqual(["Welcome", "Done"])
  })

  it("skipping goes past the rest of the tour, to the end", () => {
    expect([stepAfterSkipping("ArcImport"), stepAfterSkipping("Themes")]).toStrictEqual([
      "Done",
      "Done",
    ])
  })
})
