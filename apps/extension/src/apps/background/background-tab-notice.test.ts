import { describe, expect, it } from "@effect/vitest"
import { Effect, type Layer, Option, Schema, type Scope } from "effect"
import { type TabId, Tabs, type WindowId } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { FakeScripting } from "#platform/scripting"
import { PAGE_NOTICE_PORT_NAME, PageNoticeClick } from "#protocol"
import {
  backgroundTestLayer,
  eventually,
  openSidebar,
  startBackground,
} from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const PAGE_URL = "https://page.example/"

/** A window showing one page, with the background running and the setting as given. */
const startOnPage = (options: { readonly noticesOn: boolean }) =>
  Effect.gen(function* () {
    const fake = yield* FakeBrowser
    if (options.noticesOn) {
      yield* fake.seedStorage("sync", { "katip/settings": { backgroundTabNotices: true } })
    }
    const { windowId, tabIds } = yield* fake.seedWindow({
      tabs: [
        { url: PAGE_URL, title: "Page", active: true },
        { url: "https://elsewhere.example/", title: "Elsewhere" },
      ],
    })
    yield* startBackground
    const sidebar = yield* openSidebar(windowId)
    yield* sidebar.viewWhere((view) => view.spaces.length === 1)
    return { windowId, page: tabIds[0], elsewhere: tabIds[1], sidebar }
  })

const open = (
  windowId: WindowId,
  opener: TabId,
  url: string,
  where: "Behind" | "InFront" = "Behind",
) =>
  Tabs.use((tabs) =>
    tabs.create({ windowId, url, active: where === "InFront", openerTabId: opener }),
  )

const noticesOn = (tabId: TabId) =>
  Effect.map(
    FakeScripting.use((scripting) => scripting.functionExecutions),
    (executions) =>
      executions.flatMap((execution) =>
        execution.tabId === tabId && execution.name === "showPageToast" ? execution.args : [],
      ),
  )

const noticesOnceShown = (tabId: TabId) =>
  eventually(
    Effect.map(
      noticesOn(tabId),
      Option.liftPredicate((all) => all.length > 0),
    ),
  )

const noticeSwitchingTo = (tabId: TabId) => ({
  tone: "Opened",
  title: "Opened in a new tab",
  action: {
    _tag: "Post",
    portName: PAGE_NOTICE_PORT_NAME,
    message: { _tag: "SwitchToTab", tabId },
  },
})

/** Clicks a notice on the page in `pageTabId`, and waits for the background to be done with it. */
const clickNotice = Effect.fnUntraced(function* (pageTabId: TabId, tabId: TabId) {
  const port = yield* (yield* FakeBrowser).connect(PAGE_NOTICE_PORT_NAME, {
    external: false,
    url: Option.some(PAGE_URL),
    origin: Option.some(new URL(PAGE_URL).origin),
    tabId: Option.some(pageTabId),
  })
  yield* port.post(Schema.encodeSync(PageNoticeClick)({ _tag: "SwitchToTab", tabId }))
  yield* port.disconnected
})

const isActive = (tabId: TabId) =>
  Tabs.use((tabs) => Effect.map(tabs.get(tabId), (tab) => tab.active))

describe("telling of a tab opened in the background", () => {
  it.live("with the setting on, a page that opens a tab behind it shows a notice of it", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, page } = yield* startOnPage({ noticesOn: true })

        const opened = yield* open(windowId, page, "https://linked.example/")

        expect(yield* noticesOnceShown(page)).toStrictEqual([noticeSwitchingTo(opened.id)])
      }),
    ),
  )

  it.live("clicking the notice brings the tab to the front", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, page } = yield* startOnPage({ noticesOn: true })
        const opened = yield* open(windowId, page, "https://linked.example/")

        yield* clickNotice(page, opened.id)

        expect(yield* isActive(opened.id)).toBe(true)
      }),
    ),
  )

  it.live("a click never brings a tab of another window to the front", () =>
    inBackground(
      Effect.gen(function* () {
        const { page } = yield* startOnPage({ noticesOn: true })
        const other = yield* (yield* FakeBrowser).seedWindow({
          tabs: [{ url: "https://a.example/", active: true }, { url: "https://b.example/" }],
        })

        yield* clickNotice(page, other.tabIds[1])

        expect(yield* isActive(other.tabIds[1])).toBe(false)
      }),
    ),
  )

  it.live("tells nothing while the setting is off", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, page, sidebar } = yield* startOnPage({ noticesOn: false })

        const opened = yield* open(windowId, page, "https://linked.example/")
        yield* sidebar.viewWhere((view) =>
          view.spaces.some((space) =>
            space.temporaryEntries.some(
              (entry) => entry._tag === "TemporaryTab" && entry.tab.tabId === opened.id,
            ),
          ),
        )
        yield* Effect.sleep("200 millis")

        expect(yield* noticesOn(page)).toStrictEqual([])
      }),
    ),
  )

  it.live("tells nothing of a tab opened in front, or from a page that isn't in front", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, page, elsewhere } = yield* startOnPage({ noticesOn: true })

        yield* open(windowId, elsewhere, "https://from-behind.example/")
        yield* open(windowId, page, "https://in-front.example/", "InFront")
        yield* Tabs.use((tabs) => tabs.update(page, { active: true }))
        const last = yield* open(windowId, page, "https://last.example/")

        // Browser events are handled in order, so the notices are settled once the last shows
        expect([yield* noticesOnceShown(page), yield* noticesOn(elsewhere)]).toStrictEqual([
          [noticeSwitchingTo(last.id)],
          [],
        ])
      }),
    ),
  )

  it.live(
    "on a page that can't show a notice, the window's side panel tells of the tab, switching to it when clicked",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { windowId, page, sidebar } = yield* startOnPage({ noticesOn: true })
          yield* (yield* FakeScripting).failNextInjectionInto(page)

          const opened = yield* open(windowId, page, "https://linked.example/")

          expect(
            yield* sidebar.fullNoticeWhere((notice) => notice.switchToTabId !== undefined),
          ).toStrictEqual({
            _tag: "Notice",
            message: "Opened in a new tab",
            switchToTabId: opened.id,
          })
        }),
      ),
  )
})
