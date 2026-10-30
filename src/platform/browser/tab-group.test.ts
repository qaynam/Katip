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

describe("Chrome のタブグループの変換", () => {
  it("タイトルが空文字のグループは無題になる", () => {
    const group = fromChromeTabGroup(chromeGroup({ title: "" }))

    assert.deepStrictEqual(group.title, Option.none())
  })

  it("タイトルを返さなかったグループは無題になる", () => {
    const group = fromChromeTabGroup({
      id: 5,
      windowId: 10,
      color: "blue",
      collapsed: false,
      shared: false,
    })

    assert.deepStrictEqual(group.title, Option.none())
  })

  it("タイトルのあるグループはそのタイトルを持つ", () => {
    const group = fromChromeTabGroup(chromeGroup({ title: "Work" }))

    assert.deepStrictEqual(group.title, Option.some("Work"))
  })
})
