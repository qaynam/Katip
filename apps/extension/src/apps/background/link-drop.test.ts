import { describe, expect, it } from "@effect/vitest"
import { Effect, type Layer, Option, type Scope } from "effect"
import { Tabs } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import type { SidebarView, SpaceView } from "#protocol"
import { backgroundTestLayer, openSidebar, startBackground } from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const LINK = "https://linked.example/"

const startWithTwoTabs = Effect.gen(function* () {
  const { windowId, tabIds } = yield* (yield* FakeBrowser).seedWindow({
    tabs: [
      { url: "https://a.example/", title: "A", active: true },
      { url: "https://b.example/", title: "B" },
    ],
  })
  yield* startBackground
  const sidebar = yield* openSidebar(windowId)
  const home = (yield* sidebar.viewWhere((view) => view.spaces.length === 1)).activeSpaceId
  return { windowId, tabIds, sidebar, home }
})

const homeOf = (view: SidebarView): SpaceView | undefined =>
  view.spaces.find((space) => space.id === view.activeSpaceId)

const temporaryUrlsIn = (view: SidebarView) =>
  (homeOf(view)?.temporaryEntries ?? []).flatMap((entry) =>
    entry._tag === "TemporaryTab" ? [entry.tab.url] : [],
  )

const pinsIn = (view: SidebarView) => {
  const pinned = homeOf(view)?.pinned
  return pinned?._tag === "Available"
    ? pinned.nodes.flatMap((node) =>
        node._tag === "PinnedItem"
          ? [{ title: node.title, url: node.url, isOpen: node.openTab !== null }]
          : [],
      )
    : []
}

describe("a link dragged in from a page", () => {
  it.live("dropped among the temporary tabs, opens in front where it was dropped", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabIds, sidebar, home } = yield* startWithTwoTabs

        yield* sidebar.run({
          _tag: "OpenLinkInTemporary",
          windowId,
          url: LINK,
          spaceId: home,
          placement: { _tag: "Below", tabId: tabIds[0] },
        })
        const view = yield* sidebar.viewWhere((v) => temporaryUrlsIn(v).includes(LINK))
        const [active] = yield* Tabs.use((tabs) => tabs.query({ windowId, active: true }))

        // New tabs show at the top by default, so B, opened after A, is above it
        expect([
          temporaryUrlsIn(view),
          Option.getOrNull(active?.url ?? Option.none()),
        ]).toStrictEqual([["https://b.example/", "https://a.example/", LINK], LINK])
      }),
    ),
  )

  it.live("dropped among the pins, stays there as a pin without opening", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, sidebar, home } = yield* startWithTwoTabs

        yield* sidebar.run({
          _tag: "PinLink",
          url: LINK,
          title: "Linked page",
          placement: { spaceId: home, parentId: null, index: 0 },
        })
        const view = yield* sidebar.viewWhere((v) => pinsIn(v).length > 0)
        const tabCount = (yield* Tabs.use((tabs) => tabs.query({ windowId }))).length

        expect([pinsIn(view), tabCount]).toStrictEqual([
          [{ title: "Linked page", url: LINK, isOpen: false }],
          2,
        ])
      }),
    ),
  )

  it.live("without text, as an image link, is pinned under its address", () =>
    inBackground(
      Effect.gen(function* () {
        const { sidebar, home } = yield* startWithTwoTabs

        yield* sidebar.run({
          _tag: "PinLink",
          url: LINK,
          title: "  ",
          placement: { spaceId: home, parentId: null, index: 0 },
        })
        const view = yield* sidebar.viewWhere((v) => pinsIn(v).length > 0)

        expect(pinsIn(view).map(({ title }) => title)).toStrictEqual([LINK])
      }),
    ),
  )

  it.live("that isn't a web page is refused, whether opened or pinned", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabIds, sidebar, home } = yield* startWithTwoTabs
        const script = "javascript:alert(1)"

        const outcomes = [
          yield* sidebar.run({
            _tag: "OpenLinkInTemporary",
            windowId,
            url: script,
            spaceId: home,
            placement: { _tag: "Below", tabId: tabIds[0] },
          }),
          yield* sidebar.run({
            _tag: "PinLink",
            url: script,
            title: "Script",
            placement: { spaceId: home, parentId: null, index: 0 },
          }),
        ]

        expect(outcomes).toStrictEqual([
          { _tag: "Failed", reason: "This URL can't be opened" },
          { _tag: "Failed", reason: "This URL can't be opened" },
        ])
      }),
    ),
  )
})
