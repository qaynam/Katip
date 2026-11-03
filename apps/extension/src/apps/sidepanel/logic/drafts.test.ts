import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { bookmarkTitleChange, spaceNameChange, tabTitleChange } from "./drafts"

describe("spaceNameChange", () => {
  it("renames to the new name with surrounding whitespace trimmed", () => {
    expect(Option.getOrNull(spaceNameChange("  Reading ", "Work"))).toBe("Reading")
  })

  it("doesn't rename to a whitespace-only name", () => {
    expect(Option.isNone(spaceNameChange("   ", "Work"))).toBe(true)
  })

  it("doesn't rename when the name is unchanged", () => {
    expect(Option.isNone(spaceNameChange("Work ", "Work"))).toBe(true)
  })
})

describe("tabTitleChange", () => {
  it("clears the custom tab title when emptied", () => {
    expect(Option.getOrNull(tabTitleChange("  ", "Inbox"))).toBe("")
  })

  it("does nothing when the shown name is unchanged", () => {
    expect(Option.isNone(tabTitleChange("Inbox", "Inbox"))).toBe(true)
  })
})

describe("bookmarkTitleChange", () => {
  it("doesn't rename to an empty name", () => {
    expect(Option.isNone(bookmarkTitleChange("", "Docs"))).toBe(true)
  })

  it("renames to the new name", () => {
    expect(Option.getOrNull(bookmarkTitleChange("Design docs", "Docs"))).toBe("Design docs")
  })
})
