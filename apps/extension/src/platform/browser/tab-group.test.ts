import { assert, describe, it } from "@effect/vitest"
import { Option } from "effect"
import { fromChromeTabGroup } from "./tab-group"

const chromeGroup = (
  overrides: Partial<chrome.tabGroups.TabGroup> = {},
): chrome.tabGroups.TabGroup => ({
  id: 5,
  windowId: 10,
  title: "Work",
  color: "blue",
  collapsed: false,
  shared: false,
  ...overrides,
})

describe("converting a Chrome tab group", () => {
  it("a group titled with an empty string is untitled", () => {
    const group = fromChromeTabGroup(chromeGroup({ title: "" }))

    assert.deepStrictEqual(group.title, Option.none())
  })

  it("a group returned without a title is untitled", () => {
    const group = fromChromeTabGroup({
      id: 5,
      windowId: 10,
      color: "blue",
      collapsed: false,
      shared: false,
    })

    assert.deepStrictEqual(group.title, Option.none())
  })

  it("a group with a title keeps that title", () => {
    const group = fromChromeTabGroup(chromeGroup({ title: "Work" }))

    assert.deepStrictEqual(group.title, Option.some("Work"))
  })
})
