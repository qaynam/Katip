import { assert, describe, it } from "@effect/vitest"
import { Option } from "effect"
import { SplitViewId, TabGroupId, TabId } from "./ids"
import { fromChromeTab, fromChromeTabChangeInfo } from "./tab"

const chromeTab = (overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab => ({
  id: 1,
  index: 0,
  windowId: 10,
  url: "https://example.com/",
  title: "Example",
  pinned: false,
  highlighted: false,
  active: false,
  frozen: false,
  incognito: false,
  selected: false,
  discarded: false,
  autoDiscardable: true,
  groupId: -1,
  lastAccessed: 0,
  ...overrides,
})

describe("converting a Chrome tab", () => {
  it("a tab without an ID is not converted", () => {
    const converted = fromChromeTab(chromeTab({ id: undefined }))

    assert.isTrue(Option.isNone(converted))
  })

  it("a tab whose ID is TAB_ID_NONE is not converted", () => {
    const converted = fromChromeTab(chromeTab({ id: -1 }))

    assert.isTrue(Option.isNone(converted))
  })

  it("a tab whose groupId is -1 is in no group", () => {
    const converted = fromChromeTab(chromeTab({ groupId: -1 }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.groupId),
      Option.some(Option.none()),
    )
  })

  it("a tab in a group has that group's ID", () => {
    const converted = fromChromeTab(chromeTab({ groupId: 7 }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.groupId),
      Option.some(Option.some(TabGroupId.make(7))),
    )
  })

  it("a URL, title or favicon not yet known becomes None", () => {
    const converted = fromChromeTab(chromeTab({ url: undefined, title: "", favIconUrl: undefined }))

    assert.deepStrictEqual(
      Option.map(converted, ({ url, title, favIconUrl }) => [url, title, favIconUrl]),
      Option.some([Option.none(), Option.none(), Option.none()]),
    )
  })

  it("a tab without muted info is not muted", () => {
    const converted = fromChromeTab(chromeTab({ mutedInfo: undefined }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.muted),
      Option.some(false),
    )
  })

  it("a tab without audible info is not audible", () => {
    const converted = fromChromeTab(chromeTab({ audible: undefined }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.audible),
      Option.some(false),
    )
  })

  it("a tab whose splitViewId is SPLIT_VIEW_ID_NONE is in no split view", () => {
    const converted = fromChromeTab(chromeTab({ splitViewId: -1 }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.splitViewId),
      Option.some(Option.none()),
    )
  })

  it("a tab from Chrome before 140, which returns no splitViewId, is in no split view", () => {
    const converted = fromChromeTab(chromeTab({ splitViewId: undefined }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.splitViewId),
      Option.some(Option.none()),
    )
  })

  it("a tab in a split view has that split view's ID", () => {
    const converted = fromChromeTab(chromeTab({ splitViewId: 4 }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.splitViewId),
      Option.some(Option.some(SplitViewId.make(4))),
    )
  })

  it("a tab with an opener has the opener's tab ID", () => {
    const converted = fromChromeTab(chromeTab({ openerTabId: 3 }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.openerTabId),
      Option.some(Option.some(TabId.make(3))),
    )
  })
})

describe("converting tab change info", () => {
  it("keeps only the reported fields", () => {
    const changes = fromChromeTabChangeInfo({ title: "New title", status: "complete" })

    assert.deepStrictEqual(changes, { title: "New title", status: "complete" })
  })

  it("reduces a muted-info change to whether the tab is muted", () => {
    const changes = fromChromeTabChangeInfo({ mutedInfo: { muted: true, reason: "user" } })

    assert.deepStrictEqual(changes, { muted: true })
  })

  it("leaving a group becomes a groupId of None", () => {
    const changes = fromChromeTabChangeInfo({ groupId: -1 })

    assert.deepStrictEqual(changes, { groupId: Option.none() })
  })

  it("joining a split view carries that split view's ID", () => {
    const changes = fromChromeTabChangeInfo({ splitViewId: 4 })

    assert.deepStrictEqual(changes, { splitViewId: Option.some(SplitViewId.make(4)) })
  })

  it("leaving a split view becomes a splitViewId of None", () => {
    const changes = fromChromeTabChangeInfo({ splitViewId: -1 })

    assert.deepStrictEqual(changes, { splitViewId: Option.none() })
  })
})
