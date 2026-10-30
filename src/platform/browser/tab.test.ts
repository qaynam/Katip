import { assert, describe, it } from "@effect/vitest"
import { Option } from "effect"
import { TabGroupId, TabId } from "./ids"
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

describe("Chrome のタブの変換", () => {
  it("ID を持たないタブは変換しない", () => {
    const converted = fromChromeTab(chromeTab({ id: undefined }))

    assert.isTrue(Option.isNone(converted))
  })

  it("ID が TAB_ID_NONE のタブは変換しない", () => {
    const converted = fromChromeTab(chromeTab({ id: -1 }))

    assert.isTrue(Option.isNone(converted))
  })

  it("groupId が -1 のタブはどのグループにも属さない", () => {
    const converted = fromChromeTab(chromeTab({ groupId: -1 }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.groupId),
      Option.some(Option.none()),
    )
  })

  it("グループに属するタブはそのグループの ID を持つ", () => {
    const converted = fromChromeTab(chromeTab({ groupId: 7 }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.groupId),
      Option.some(Option.some(TabGroupId.make(7))),
    )
  })

  it("まだ取得できていない URL・タイトル・favicon は None になる", () => {
    const converted = fromChromeTab(chromeTab({ url: undefined, title: "", favIconUrl: undefined }))

    assert.deepStrictEqual(
      Option.map(converted, ({ url, title, favIconUrl }) => [url, title, favIconUrl]),
      Option.some([Option.none(), Option.none(), Option.none()]),
    )
  })

  it("ミュートの情報が無ければミュートされていない", () => {
    const converted = fromChromeTab(chromeTab({ mutedInfo: undefined }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.muted),
      Option.some(false),
    )
  })

  it("音が鳴っているか分からなければ鳴っていない", () => {
    const converted = fromChromeTab(chromeTab({ audible: undefined }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.audible),
      Option.some(false),
    )
  })

  it("opener を持つタブは opener のタブ ID を持つ", () => {
    const converted = fromChromeTab(chromeTab({ openerTabId: 3 }))

    assert.deepStrictEqual(
      Option.map(converted, (tab) => tab.openerTabId),
      Option.some(Option.some(TabId.make(3))),
    )
  })
})

describe("タブの変化の変換", () => {
  it("通知された項目だけを持つ", () => {
    const changes = fromChromeTabChangeInfo({ title: "New title", status: "complete" })

    assert.deepStrictEqual(changes, { title: "New title", status: "complete" })
  })

  it("ミュートの変化はミュートされているかだけにする", () => {
    const changes = fromChromeTabChangeInfo({ mutedInfo: { muted: true, reason: "user" } })

    assert.deepStrictEqual(changes, { muted: true })
  })

  it("グループから外れた変化は groupId が None になる", () => {
    const changes = fromChromeTabChangeInfo({ groupId: -1 })

    assert.deepStrictEqual(changes, { groupId: Option.none() })
  })
})
