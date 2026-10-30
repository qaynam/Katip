import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import { neutralTheme } from "#modules/theme"
import { BookmarkId, TabId, WindowId } from "#platform/browser"
import {
  activeSpaceOf,
  bindPinned,
  emptyWorkspace,
  forgetTab,
  moveTabToSpace,
  recordActivation,
  releaseSpace,
  replaceTab,
  spaceOf,
  switchSpace,
  tabToFocus,
  trackTab,
  type NewTab,
  type Workspace,
} from "./workspace"

const tabId = (value: number) => TabId.make(value)
const windowId = (value: number) => WindowId.make(value)
const spaceId = (value: string) => SpaceId.make(value)

const space = (id: string): Space => ({
  id: spaceId(id),
  name: SpaceName.make(id),
  theme: neutralTheme,
})
const spaces = [space("home"), space("work"), space("fun")]

const WINDOW = windowId(1)
const EXTENSION_ORIGIN = "chrome-extension://katip/"

const newTab = (id: number, overrides: Partial<NewTab> = {}): NewTab => ({
  tabId: tabId(id),
  windowId: WINDOW,
  url: "https://example.com/",
  openerTabId: Option.none(),
  isChromePinned: false,
  ...overrides,
})

const context = (overrides: Partial<Parameters<typeof trackTab>[2]> = {}) => ({
  spaces,
  defaultSpaceId: Option.none<SpaceId>(),
  extensionOrigin: EXTENSION_ORIGIN,
  now: 1_000,
  ...overrides,
})

const track = (workspace: Workspace, tab: NewTab, overrides = {}) =>
  trackTab(workspace, tab, context(overrides))

const withActiveSpace = (id: string) => switchSpace(emptyWorkspace, WINDOW, spaceId(id))

describe("新しいタブの所属先", () => {
  it("opener のタブが属する Space に入る", () => {
    const base = track(withActiveSpace("home"), newTab(10))
    const moved = moveTabToSpace(base, tabId(10), spaceId("work"))

    const workspace = track(moved, newTab(11, { openerTabId: Option.some(tabId(10)) }))

    expect(spaceOf(workspace, tabId(11))).toStrictEqual(Option.some(spaceId("work")))
  })

  it.each([
    ["URL が空", ""],
    ["chrome://newtab/", "chrome://newtab/"],
    ["chrome://new-tab-page/", "chrome://new-tab-page/"],
    ["about:blank", "about:blank"],
  ])("新しいタブページ（%s）は opener を無視してウィンドウのアクティブ Space に入る", (_, url) => {
    const base = track(withActiveSpace("home"), newTab(10))
    const opener = moveTabToSpace(base, tabId(10), spaceId("work"))

    const workspace = track(opener, newTab(11, { url, openerTabId: Option.some(tabId(10)) }))

    expect(spaceOf(workspace, tabId(11))).toStrictEqual(Option.some(spaceId("home")))
  })

  it("opener が無ければウィンドウのアクティブ Space に入る", () => {
    const workspace = track(withActiveSpace("fun"), newTab(10))

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.some(spaceId("fun")))
  })

  it("アクティブ Space が決まっていないウィンドウでは既定の Space に入る", () => {
    const workspace = track(emptyWorkspace, newTab(10), {
      defaultSpaceId: Option.some(spaceId("work")),
    })

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.some(spaceId("work")))
  })

  it("既定の Space が削除済みなら先頭の Space に入る", () => {
    const workspace = track(emptyWorkspace, newTab(10), {
      defaultSpaceId: Option.some(spaceId("deleted")),
    })

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.some(spaceId("home")))
  })

  it("Chrome で固定されたタブはどの Space にも入らない", () => {
    const workspace = track(withActiveSpace("home"), newTab(10, { isChromePinned: true }))

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.none())
  })

  it("自拡張のページはどの Space にも入らない", () => {
    const workspace = track(
      withActiveSpace("home"),
      newTab(10, { url: `${EXTENSION_ORIGIN}options/index.html` }),
    )

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.none())
  })

  it("既に所属しているタブは、もう一度追跡しても所属が変わらない", () => {
    const tracked = track(withActiveSpace("home"), newTab(10))
    const switched = switchSpace(tracked, WINDOW, spaceId("work"))

    const workspace = track(switched, newTab(10))

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.some(spaceId("home")))
  })

  it("Space が 1 つも無いときは所属させない", () => {
    const workspace = track(emptyWorkspace, newTab(10), { spaces: [] })

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.none())
  })
})

describe("タブのアクティブ化", () => {
  it("別の Space のタブがアクティブになると、ウィンドウのアクティブ Space がそちらに切り替わる", () => {
    const tracked = track(withActiveSpace("home"), newTab(10))
    const moved = moveTabToSpace(tracked, tabId(10), spaceId("work"))

    const workspace = recordActivation(moved, { tabId: tabId(10), windowId: WINDOW, now: 2_000 })

    expect(activeSpaceOf(workspace, WINDOW)).toStrictEqual(Option.some(spaceId("work")))
  })

  it("どの Space にも属さないタブがアクティブになっても、アクティブ Space は変わらない", () => {
    const base = withActiveSpace("home")

    const workspace = recordActivation(base, { tabId: tabId(99), windowId: WINDOW, now: 2_000 })

    expect(activeSpaceOf(workspace, WINDOW)).toStrictEqual(Option.some(spaceId("home")))
  })
})

describe("タブ ID の置き換え", () => {
  it("所属とピンのバインディングが新しいタブ ID に引き継がれる", () => {
    const tracked = track(withActiveSpace("work"), newTab(10))
    const bound = bindPinned(tracked, tabId(10), {
      bookmarkId: BookmarkId.make("b1"),
      pinnedUrl: "https://example.com/",
    })

    const workspace = replaceTab(bound, tabId(10), tabId(20))

    expect({
      oldSpace: spaceOf(workspace, tabId(10)),
      newSpace: spaceOf(workspace, tabId(20)),
      binding: workspace.tabs.find((tab) => tab.tabId === tabId(20))?.pinned?.bookmarkId,
    }).toStrictEqual({
      oldSpace: Option.none(),
      newSpace: Option.some(spaceId("work")),
      binding: "b1",
    })
  })
})

describe("タブを閉じたとき", () => {
  it("所属の記録が消える", () => {
    const tracked = track(withActiveSpace("home"), newTab(10))

    const workspace = forgetTab(tracked, tabId(10))

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.none())
  })
})

describe("Space を手放すとき", () => {
  it("その Space のタブは引き継ぎ先の Space へ移り、ピンのバインディングは外れる", () => {
    const tracked = track(withActiveSpace("work"), newTab(10))
    const bound = bindPinned(tracked, tabId(10), {
      bookmarkId: BookmarkId.make("b1"),
      pinnedUrl: "https://example.com/",
    })

    const workspace = releaseSpace(bound, spaceId("work"), spaceId("home"))

    expect({
      space: spaceOf(workspace, tabId(10)),
      pinned: workspace.tabs.find((tab) => tab.tabId === tabId(10))?.pinned,
    }).toStrictEqual({ space: Option.some(spaceId("home")), pinned: null })
  })

  it("その Space をアクティブにしていたウィンドウは引き継ぎ先の Space に切り替わる", () => {
    const workspace = releaseSpace(withActiveSpace("work"), spaceId("work"), spaceId("home"))

    expect(activeSpaceOf(workspace, WINDOW)).toStrictEqual(Option.some(spaceId("home")))
  })
})

describe("Space へ切り替えたときに前面へ出すタブ", () => {
  const activate = (workspace: Workspace, id: number, now: number) =>
    recordActivation(workspace, { tabId: tabId(id), windowId: WINDOW, now })

  it("その Space で最後に使っていたタブが選ばれる", () => {
    const tracked = [10, 11, 12].reduce(
      (workspace, id) => track(workspace, newTab(id)),
      withActiveSpace("home"),
    )
    const used = activate(activate(activate(tracked, 12, 2_000), 10, 3_000), 11, 2_500)

    const focused = tabToFocus(used, spaceId("home"), [tabId(10), tabId(11), tabId(12)])

    expect(focused).toStrictEqual(Option.some(tabId(10)))
  })

  it("候補に無い（別のウィンドウにある）タブは選ばれない", () => {
    const tracked = track(track(withActiveSpace("home"), newTab(10)), newTab(11))
    const used = activate(activate(tracked, 11, 2_000), 10, 3_000)

    const focused = tabToFocus(used, spaceId("home"), [tabId(11)])

    expect(focused).toStrictEqual(Option.some(tabId(11)))
  })

  it("その Space のタブが候補に 1 つも無ければ何も選ばれない", () => {
    const tracked = track(withActiveSpace("home"), newTab(10))

    const focused = tabToFocus(tracked, spaceId("work"), [tabId(10)])

    expect(focused).toStrictEqual(Option.none())
  })
})
