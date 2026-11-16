import { Option } from "effect"
import { describe, expect, it } from "vitest"
import type { LiveItem } from "#modules/live-folders"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import { neutralTheme } from "#modules/theme"
import { BookmarkId, TabId, WindowId } from "#platform/browser"
import {
  activeSpaceOf,
  bindLiveItem,
  bindPinned,
  emptyWorkspace,
  forgetTab,
  isTemporary,
  moveTabToSpace,
  recordActivation,
  releaseSpace,
  replaceTab,
  shownSpaceOf,
  spaceOf,
  switchSpace,
  tabsBoundToLiveItem,
  tabToFocus,
  trackedTab,
  trackTab,
  unbindLiveFolder,
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

describe("where a new tab goes", () => {
  it("joins the Space its opener belongs to", () => {
    const base = track(withActiveSpace("home"), newTab(10))
    const moved = moveTabToSpace(base, tabId(10), spaceId("work"))

    const workspace = track(moved, newTab(11, { openerTabId: Option.some(tabId(10)) }))

    expect(spaceOf(workspace, tabId(11))).toStrictEqual(Option.some(spaceId("work")))
  })

  it.each([
    ["empty URL", ""],
    ["chrome://newtab/", "chrome://newtab/"],
    ["chrome://new-tab-page/", "chrome://new-tab-page/"],
    ["about:blank", "about:blank"],
  ])("a new tab page (%s) ignores its opener and joins the window's active Space", (_, url) => {
    const base = track(withActiveSpace("home"), newTab(10))
    const opener = moveTabToSpace(base, tabId(10), spaceId("work"))

    const workspace = track(opener, newTab(11, { url, openerTabId: Option.some(tabId(10)) }))

    expect(spaceOf(workspace, tabId(11))).toStrictEqual(Option.some(spaceId("home")))
  })

  it("joins the window's active Space when it has no opener", () => {
    const workspace = track(withActiveSpace("fun"), newTab(10))

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.some(spaceId("fun")))
  })

  it("joins the default Space in a window without an active Space", () => {
    const workspace = track(emptyWorkspace, newTab(10), {
      defaultSpaceId: Option.some(spaceId("work")),
    })

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.some(spaceId("work")))
  })

  it("joins the first Space when the default Space was deleted", () => {
    const workspace = track(emptyWorkspace, newTab(10), {
      defaultSpaceId: Option.some(spaceId("deleted")),
    })

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.some(spaceId("home")))
  })

  it("a tab pinned in Chrome joins no Space", () => {
    const workspace = track(withActiveSpace("home"), newTab(10, { isChromePinned: true }))

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.none())
  })

  it("Katip's own pages join no Space", () => {
    const workspace = track(
      withActiveSpace("home"),
      newTab(10, { url: `${EXTENSION_ORIGIN}options/index.html` }),
    )

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.none())
  })

  it("tracking a tab that already belongs to a Space again leaves it there", () => {
    const tracked = track(withActiveSpace("home"), newTab(10))
    const switched = switchSpace(tracked, WINDOW, spaceId("work"))

    const workspace = track(switched, newTab(10))

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.some(spaceId("home")))
  })

  it("joins nothing when there are no Spaces", () => {
    const workspace = track(emptyWorkspace, newTab(10), { spaces: [] })

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.none())
  })
})

describe("activating a tab", () => {
  it("switches the window's active Space to the Space of the activated tab", () => {
    const tracked = track(withActiveSpace("home"), newTab(10))
    const moved = moveTabToSpace(tracked, tabId(10), spaceId("work"))

    const workspace = recordActivation(moved, { tabId: tabId(10), windowId: WINDOW, now: 2_000 })

    expect(activeSpaceOf(workspace, WINDOW)).toStrictEqual(Option.some(spaceId("work")))
  })

  it("leaves the active Space as it is when the activated tab belongs to no Space", () => {
    const base = withActiveSpace("home")

    const workspace = recordActivation(base, { tabId: tabId(99), windowId: WINDOW, now: 2_000 })

    expect(activeSpaceOf(workspace, WINDOW)).toStrictEqual(Option.some(spaceId("home")))
  })
})

describe("replacing a tab ID", () => {
  it("carries the Space and pin binding over to the new tab ID", () => {
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

describe("closing a tab", () => {
  it("forgets which Space it belonged to", () => {
    const tracked = track(withActiveSpace("home"), newTab(10))

    const workspace = forgetTab(tracked, tabId(10))

    expect(spaceOf(workspace, tabId(10))).toStrictEqual(Option.none())
  })
})

describe("binding a tab to a live folder item", () => {
  const LIVE = BookmarkId.make("live")
  const mail: LiveItem = {
    id: "mail-1",
    title: "Invoice attached",
    subtitle: "Hanako Sato",
    url: "https://mail.google.com/mail/u/0/#inbox/mail-1",
    updatedAt: 100,
  }
  const pin = { bookmarkId: BookmarkId.make("b1"), pinnedUrl: "https://example.com/" }
  const tracked = track(withActiveSpace("work"), newTab(10))
  const bindingOf = (workspace: Workspace) =>
    Option.map(trackedTab(workspace, tabId(10)), (tab) => [tab.pinned, tab.liveItem])

  it("makes the tab the item's tab, which is no longer a temporary tab", () => {
    const workspace = bindLiveItem(tracked, tabId(10), { folderId: LIVE, item: mail })

    expect({
      boundTabs: tabsBoundToLiveItem(workspace, LIVE, "mail-1").map((tab) => tab.tabId),
      isTemporary: Option.map(trackedTab(workspace, tabId(10)), isTemporary),
    }).toStrictEqual({ boundTabs: [tabId(10)], isTemporary: Option.some(false) })
  })

  it("takes a pinned tab off its pin", () => {
    const workspace = bindLiveItem(bindPinned(tracked, tabId(10), pin), tabId(10), {
      folderId: LIVE,
      item: mail,
    })

    expect(bindingOf(workspace)).toStrictEqual(Option.some([null, { folderId: LIVE, item: mail }]))
  })

  it("pinning the tab takes it off the item", () => {
    const workspace = bindPinned(
      bindLiveItem(tracked, tabId(10), { folderId: LIVE, item: mail }),
      tabId(10),
      pin,
    )

    expect(bindingOf(workspace)).toStrictEqual(Option.some([pin, null]))
  })

  it("unbinding the live folder makes its items' tabs temporary again", () => {
    const workspace = unbindLiveFolder(
      bindLiveItem(tracked, tabId(10), { folderId: LIVE, item: mail }),
      LIVE,
    )

    expect(Option.map(trackedTab(workspace, tabId(10)), isTemporary)).toStrictEqual(
      Option.some(true),
    )
  })

  it("releasing the tab's Space unbinds it, as the live folder goes with the Space", () => {
    const workspace = releaseSpace(
      bindLiveItem(tracked, tabId(10), { folderId: LIVE, item: mail }),
      spaceId("work"),
      spaceId("home"),
    )

    expect(bindingOf(workspace)).toStrictEqual(Option.some([null, null]))
  })
})

describe("the Space a window shows", () => {
  it("is the Space last switched to there", () => {
    expect(shownSpaceOf(withActiveSpace("work"), spaces, WINDOW)).toStrictEqual(
      Option.some(spaceId("work")),
    )
  })

  it("is the first Space while none has been switched to there, or the one switched to is gone", () => {
    expect([
      shownSpaceOf(emptyWorkspace, spaces, WINDOW),
      shownSpaceOf(withActiveSpace("gone"), spaces, WINDOW),
    ]).toStrictEqual([Option.some(spaceId("home")), Option.some(spaceId("home"))])
  })
})

describe("releasing a Space", () => {
  it("moves its tabs to the successor Space and unbinds their pins", () => {
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

  it("switches windows that had it active to the successor Space", () => {
    const workspace = releaseSpace(withActiveSpace("work"), spaceId("work"), spaceId("home"))

    expect(activeSpaceOf(workspace, WINDOW)).toStrictEqual(Option.some(spaceId("home")))
  })
})

describe("the tab brought forward on switching to a Space", () => {
  const activate = (workspace: Workspace, id: number, now: number) =>
    recordActivation(workspace, { tabId: tabId(id), windowId: WINDOW, now })

  it("is the one last used in that Space", () => {
    const tracked = [10, 11, 12].reduce(
      (workspace, id) => track(workspace, newTab(id)),
      withActiveSpace("home"),
    )
    const used = activate(activate(activate(tracked, 12, 2_000), 10, 3_000), 11, 2_500)

    const focused = tabToFocus(used, spaceId("home"), [tabId(10), tabId(11), tabId(12)])

    expect(focused).toStrictEqual(Option.some(tabId(10)))
  })

  it("is never a tab outside the candidates (in another window)", () => {
    const tracked = track(track(withActiveSpace("home"), newTab(10)), newTab(11))
    const used = activate(activate(tracked, 11, 2_000), 10, 3_000)

    const focused = tabToFocus(used, spaceId("home"), [tabId(11)])

    expect(focused).toStrictEqual(Option.some(tabId(11)))
  })

  it("is none when no candidate belongs to that Space", () => {
    const tracked = track(withActiveSpace("home"), newTab(10))

    const focused = tabToFocus(tracked, spaceId("work"), [tabId(10)])

    expect(focused).toStrictEqual(Option.none())
  })
})
