import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, Layer, Option, type Scope } from "effect"
import { FakeBrowser, type TabSeed } from "#platform/browser-testing"
import { themeOf } from "#modules/theme"
import { ClipboardRecorder } from "#platform/clipboard"
import { FakeScripting } from "#platform/scripting"
import { OperationTimeLimit } from "./program"
import { Alarms, Bookmarks, type BrowserTab, Storage, Tabs, TabId } from "#platform/browser"
import type {
  CommandOutcome,
  PinnedItemView,
  PinnedNodeView,
  SidebarView,
  SpaceView,
} from "#protocol"
import {
  backgroundTestLayer,
  backgroundTestLayerWith,
  eventually,
  openSidebar,
  spaceNamed,
  startBackground,
} from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const temporaryTabsIn = (space: SpaceView) =>
  space.temporaryEntries.flatMap((entry) =>
    entry._tag === "TemporaryTab" ? [entry.tab] : [...entry.tabs],
  )

const temporaryTitles = (view: SidebarView, spaceName: string) =>
  Option.map(spaceNamed(view, spaceName), (space) => temporaryTabsIn(space).map((tab) => tab.title))

const pinnedItems = (view: SidebarView, spaceName: string): ReadonlyArray<PinnedItemView> =>
  Option.match(spaceNamed(view, spaceName), {
    onNone: () => [],
    onSome: (space) =>
      space.pinned._tag === "Available"
        ? space.pinned.nodes.filter((node) => node._tag === "PinnedItem")
        : [],
  })

const activeSpaceName = (view: SidebarView) =>
  Option.map(
    Array.findFirst(view.spaces, (space) => space.id === view.activeSpaceId),
    (space) => space.name,
  )

describe("startup", () => {
  it.live("with no Spaces, creates Home and puts the open tabs in it", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({
          tabs: [
            { url: "https://a.example/", title: "A" },
            { url: "https://b.example/", title: "B" },
          ],
        })

        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const view = yield* sidebar.viewWhere((v) =>
          Option.exists(temporaryTitles(v, "Home"), (titles) => titles.length === 2),
        )

        expect(view.spaces.map((space) => space.name)).toStrictEqual(["Home"])
      }),
    ),
  )

  // Suspected product bug, kept as `fails` until fixed: Chrome unpins a Favorite right before closing
  // it, so the closing tab is admitted as a temporary tab and consumes the restore record
  it.live.fails(
    "closing a Favorite right after a restart leaves the restore record for a tab opened later with the same URL",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedStorage("local", {
            "katip/spaces": [
              { id: "home", name: "Home", color: "grey" },
              { id: "work", name: "Work", color: "blue" },
            ],
            "katip/restore-snapshot": [
              { url: "https://mail.example/", spaceId: "work", pinned: null, titleOverride: null },
            ],
          })
          const {
            windowId,
            tabIds: [favorite],
          } = yield* fake.seedWindow({
            tabs: [
              { url: "https://mail.example/", title: "Mail", pinned: true },
              { url: "https://home.example/", title: "Home page", active: true },
            ],
          })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          yield* sidebar.viewWhere((v) => v.spaces.length === 2)

          yield* (yield* Tabs).remove([favorite])
          yield* (yield* Tabs).create({ windowId, url: "https://mail.example/", active: false })
          const view = yield* sidebar.viewWhere((v) =>
            v.spaces.some((space) =>
              temporaryTabsIn(space).some((tab) => tab.url === "https://mail.example/"),
            ),
          )

          expect(
            temporaryTitles(view, "Work").pipe(Option.map((titles) => titles.length)),
          ).toStrictEqual(Option.some(1))
        }),
      ),
  )

  it.live("after a browser restart, tabs matching a recorded URL return to their Space", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedStorage("local", {
          "katip/spaces": [
            { id: "home", name: "Home", color: "grey" },
            { id: "work", name: "Work", color: "blue" },
          ],
          "katip/restore-snapshot": [
            { url: "https://work.example/", spaceId: "work", pinned: null, titleOverride: null },
          ],
        })
        const { windowId } = yield* fake.seedWindow({
          tabs: [
            { url: "https://home.example/", title: "Home page" },
            { url: "https://work.example/", title: "Work page" },
          ],
        })

        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const view = yield* sidebar.viewWhere((v) =>
          Option.exists(temporaryTitles(v, "Work"), (titles) => titles.length === 1),
        )

        expect([temporaryTitles(view, "Home"), temporaryTitles(view, "Work")]).toStrictEqual([
          Option.some(["Home page"]),
          Option.some(["Work page"]),
        ])
      }),
    ),
  )
})

describe("quitting and restarting the browser", () => {
  it.live(
    "a tab pinned in a folder is open as the same pin after quitting and reopening",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const storage = yield* Storage
          const first = yield* fake.seedWindow({
            tabs: [
              { url: "https://mail.example/", title: "Mail" },
              { url: "https://other.example/", title: "Other" },
            ],
          })
          // Closing the first session's scope makes sure its background has stopped
          yield* Effect.scoped(
            Effect.gen(function* () {
              yield* startBackground
              const sidebar = yield* openSidebar(first.windowId)
              const initial = yield* sidebar.viewWhere((v) => v.spaces.length === 1)
              const folder = yield* sidebar.run({
                _tag: "CreateFolder",
                spaceId: initial.activeSpaceId,
                parentId: null,
              })
              const folderId = folder._tag === "Succeeded" ? folder.createdBookmarkId : null
              yield* sidebar.run({
                _tag: "PlaceTabInPinned",
                tabId: first.tabIds[0],
                placement: { spaceId: initial.activeSpaceId, parentId: folderId, index: 0 },
              })
              // The restore snapshot is saved after a delay, so wait until it is
              yield* Effect.sleep("1500 millis")

              yield* fake.closeWindow(first.windowId)
              yield* Effect.sleep("1500 millis")
            }),
          )
          yield* storage.session.remove("katip/workspace")
          yield* storage.session.remove("katip/restore-queue")
          const restored = yield* fake.seedWindow({
            tabs: [
              { url: "https://mail.example/", title: "Mail" },
              { url: "https://other.example/", title: "Other" },
            ],
          })
          yield* startBackground
          // The fake reuses the first start's connection channel, so a connection made before the
          // second background subscribes to it reaches no one. Real Chrome makes a channel on every
          // start and holds connections until the subscription, so it doesn't happen there
          yield* Effect.sleep("300 millis")
          const reopened = yield* openSidebar(restored.windowId)
          const view = yield* reopened.viewWhere((v) =>
            Option.exists(spaceNamed(v, "Home"), (space) => space.pinned._tag === "Available"),
          )
          const folderView = Option.getOrThrow(spaceNamed(view, "Home")).pinned
          const pins =
            folderView._tag === "Available"
              ? folderView.nodes.flatMap((node) =>
                  node._tag === "PinnedFolder" ? node.children : [],
                )
              : []

          expect(
            pins.map((pin) =>
              pin._tag === "PinnedItem" ? [pin.title, pin.openTab?.tab.tabId] : pin,
            ),
          ).toStrictEqual([["Mail", restored.tabIds[0]]])
        }),
      ),
    20_000,
  )
})

describe("Space commands", () => {
  it.live("creating a Space switches to it and opens a new tab in it", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)

        const outcome = yield* sidebar.run({ _tag: "CreateSpace", windowId })
        const view = yield* sidebar.viewWhere((v) =>
          Option.exists(spaceNamed(v, "Space 2"), (space) => temporaryTabsIn(space).length === 1),
        )

        expect([outcome._tag, activeSpaceName(view)]).toStrictEqual([
          "Succeeded",
          Option.some("Space 2"),
        ])
      }),
    ),
  )

  it.live(
    "deleting a Space moves its temporary tabs to a remaining Space instead of closing them",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          yield* sidebar.run({ _tag: "CreateSpace", windowId })
          const created = yield* sidebar.viewWhere((v) => v.spaces.length === 2)
          const doomed = Option.getOrThrow(spaceNamed(created, "Space 2"))

          yield* sidebar.run({ _tag: "DeleteSpace", spaceId: doomed.id })
          const view = yield* sidebar.viewWhere((v) => v.spaces.length === 1)

          expect(
            Option.map(spaceNamed(view, "Home"), (s) => temporaryTabsIn(s).length),
          ).toStrictEqual(Option.some(2))
        }),
      ),
  )

  it.live(
    "changing the theme shows in the view, and a synced tab group takes the color closest to it",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedStorage("sync", { "katip/settings": { syncTabGroups: true } })
          const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          const before = yield* sidebar.viewWhere((v) => v.spaces.length === 1)
          const pink = themeOf([{ hue: 350, chroma: 0.7 }])

          yield* sidebar.run({ _tag: "SetSpaceTheme", spaceId: before.activeSpaceId, theme: pink })
          const view = yield* sidebar.viewWhere((v) => v.spaces[0]?.theme.colors[0]?.hue === 350)
          const groupColor = yield* eventually(
            Effect.map(fake.snapshot, (snapshot) =>
              Option.filter(
                Option.fromNullishOr(snapshot.groups[0]?.color),
                (color) => color === "pink",
              ),
            ),
          )

          expect([view.spaces[0]?.theme, groupColor]).toStrictEqual([pink, "pink"])
        }),
      ),
  )

  it.live("the last Space can't be deleted", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const view = yield* sidebar.viewWhere((v) => v.spaces.length === 1)

        const outcome = yield* sidebar.run({ _tag: "DeleteSpace", spaceId: view.activeSpaceId })

        expect(outcome).toStrictEqual({ _tag: "Failed", reason: "The last Space can't be deleted" })
      }),
    ),
  )
})

describe("display language", () => {
  it.live(
    "with Spanish chosen, the first Space's name and the reason for a refusal are in Spanish",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedStorage("sync", { "katip/settings": { locale: "es" } })
          const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          const view = yield* sidebar.viewWhere((v) => v.spaces.length === 1)

          const outcome = yield* sidebar.run({ _tag: "DeleteSpace", spaceId: view.activeSpaceId })

          expect([view.spaces.map((space) => space.name), outcome]).toStrictEqual([
            ["Inicio"],
            { _tag: "Failed", reason: "No se puede eliminar el último espacio" },
          ])
        }),
      ),
  )

  it.live("with Spanish chosen, a new folder and a new Space get Spanish names", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedStorage("sync", { "katip/settings": { locale: "es" } })
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const home = (yield* sidebar.viewWhere((v) => v.spaces.length === 1)).activeSpaceId

        yield* sidebar.run({ _tag: "CreateFolder", spaceId: home, parentId: null })
        yield* sidebar.run({ _tag: "CreateSpace", windowId })
        const view = yield* sidebar.viewWhere((v) => v.spaces.length === 2)
        const folders = Option.match(spaceNamed(view, "Inicio"), {
          onNone: () => [],
          onSome: (space) =>
            space.pinned._tag === "Available" ? space.pinned.nodes.map((node) => node.title) : [],
        })

        expect([view.spaces.map((space) => space.name), folders]).toStrictEqual([
          ["Inicio", "Espacio 2"],
          ["Nueva carpeta"],
        ])
      }),
    ),
  )
})

describe("tabs", () => {
  it.live("a tab opened while a Space is active becomes a temporary tab of that Space", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.run({ _tag: "CreateSpace", windowId })
        yield* sidebar.viewWhere((v) => v.spaces.length === 2)

        yield* (yield* Tabs).create({ windowId, url: "https://new.example/", active: false })
        const view = yield* sidebar.viewWhere((v) =>
          Option.exists(spaceNamed(v, "Space 2"), (space) => temporaryTabsIn(space).length === 2),
        )

        expect(
          Option.map(spaceNamed(view, "Space 2"), (s) => temporaryTabsIn(s).map((t) => t.url)),
        ).toStrictEqual(Option.some(["https://new.example/", "chrome://newtab/"]))
      }),
    ),
  )

  // Suspected product bug, kept as `fails` until fixed: Chrome sends the unpinning with the window the
  // tab is leaving, so it lands in the Space shown in that window instead
  it.live.fails(
    "moving a Favorite to another window makes it a temporary tab of the Space shown in the destination window",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const {
            tabIds: [favorite],
          } = yield* fake.seedWindow({
            tabs: [{ url: "https://favorite.example/", pinned: true }, { active: true }],
          })
          const { windowId: destination } = yield* fake.seedWindow({ tabs: [{}], focused: true })
          yield* startBackground
          const sidebar = yield* openSidebar(destination)
          yield* sidebar.run({ _tag: "CreateSpace", windowId: destination })
          yield* sidebar.viewWhere((v) =>
            Option.exists(activeSpaceName(v), (name) => name === "Space 2"),
          )

          yield* (yield* Tabs).move([favorite], { windowId: destination, index: "end" })
          const view = yield* sidebar.viewWhere((v) =>
            v.spaces.some((space) =>
              temporaryTabsIn(space).some((tab) => tab.url === "https://favorite.example/"),
            ),
          )

          expect(
            view.spaces
              .filter((space) =>
                temporaryTabsIn(space).some((tab) => tab.url === "https://favorite.example/"),
              )
              .map((space) => space.name),
          ).toStrictEqual(["Space 2"])
        }),
      ),
  )

  it.live("closing a pinned tab leaves a closed pin", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/", title: "Mail" }, { url: "https://b.example/" }],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)

        yield* sidebar.run({ _tag: "PinTab", tabId: tabIds[0] })
        yield* sidebar.viewWhere((v) => pinnedItems(v, "Home").some((p) => p.openTab !== null))
        yield* sidebar.run({ _tag: "CloseTab", tabId: tabIds[0] })
        const view = yield* sidebar.viewWhere((v) =>
          pinnedItems(v, "Home").some((p) => p.openTab === null),
        )

        expect(pinnedItems(view, "Home").map((p) => [p.title, p.url, p.openTab])).toStrictEqual([
          ["Mail", "https://mail.example/", null],
        ])
      }),
    ),
  )

  it.live("opening a closed pin opens a tab bound to that pin", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/", title: "Mail" }, { url: "https://b.example/" }],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)
        yield* sidebar.run({ _tag: "PinTab", tabId: tabIds[0] })
        yield* sidebar.run({ _tag: "CloseTab", tabId: tabIds[0] })
        const closed = yield* sidebar.viewWhere((v) =>
          pinnedItems(v, "Home").some((p) => p.openTab === null),
        )
        const pin = Option.getOrThrow(Array.head(pinnedItems(closed, "Home")))

        yield* sidebar.run({ _tag: "OpenPinnedItem", windowId, bookmarkId: pin.bookmarkId })
        const view = yield* sidebar.viewWhere((v) =>
          pinnedItems(v, "Home").some((p) => p.openTab !== null),
        )

        expect({
          temporary: temporaryTitles(view, "Home").pipe(Option.map((titles) => titles.length)),
          openedUrl: pinnedItems(view, "Home")[0]?.openTab?.tab.url,
        }).toStrictEqual({ temporary: Option.some(1), openedUrl: "https://mail.example/" })
      }),
    ),
  )

  it.live("toggling the pin with the shortcut creates the bookmark, then removes it", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://a.example/", title: "A", active: true }],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)
        const tab = yield* (yield* Tabs).get(tabIds[0])
        const toggle = fake.emit({
          _tag: "CommandTriggered",
          command: "quick-pin-toggle",
          tab: Option.some(tab),
        })
        const searchPin = Effect.map(
          (yield* Bookmarks).search({ url: "https://a.example/" }),
          (found) => found.length,
        )

        yield* toggle
        const pinned = yield* eventually(
          Effect.map(
            searchPin,
            Option.liftPredicate((n) => n === 1),
          ),
        )
        yield* toggle
        const unpinned = yield* eventually(
          Effect.map(
            searchPin,
            Option.liftPredicate((n) => n === 0),
          ),
        )

        expect([pinned, unpinned]).toStrictEqual([1, 0])
      }),
    ),
  )
})

describe("tabs opened from another tab", () => {
  const temporaryUrls = (view: SidebarView) =>
    Option.map(spaceNamed(view, "Home"), (space) => temporaryTabsIn(space).map((tab) => tab.url))

  const showsTemporaryTabs = (count: number) => (view: SidebarView) =>
    Option.exists(temporaryUrls(view), (urls) => urls.length === count)

  const showNewTabsAtTheBottom = Storage.use((storage) =>
    storage.sync.set("katip/settings", { newTabsOnTop: false }),
  )

  it.live("a link opened from a temporary tab shows right below it", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [
            { url: "https://a.example/" },
            { url: "https://b.example/" },
            { url: "https://c.example/" },
          ],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere(showsTemporaryTabs(3))

        yield* fake.openLink(tabIds[1], "https://link.example/")
        const view = yield* sidebar.viewWhere(showsTemporaryTabs(4))

        expect(temporaryUrls(view)).toStrictEqual(
          Option.some([
            "https://c.example/",
            "https://b.example/",
            "https://link.example/",
            "https://a.example/",
          ]),
        )
      }),
    ),
  )

  it.live(
    "links opened one after another from a temporary tab show right below it, the latest first",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [
              { url: "https://a.example/" },
              { url: "https://b.example/" },
              { url: "https://c.example/" },
            ],
          })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          yield* sidebar.viewWhere(showsTemporaryTabs(3))

          yield* fake.openLink(tabIds[1], "https://first.example/")
          yield* sidebar.viewWhere(showsTemporaryTabs(4))
          yield* fake.openLink(tabIds[1], "https://second.example/")
          const view = yield* sidebar.viewWhere(showsTemporaryTabs(5))

          expect(temporaryUrls(view)).toStrictEqual(
            Option.some([
              "https://c.example/",
              "https://b.example/",
              "https://second.example/",
              "https://first.example/",
              "https://a.example/",
            ]),
          )
        }),
      ),
  )

  it.live("a link opened from a pin shows at the top of the temporary tabs", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [
            { url: "https://a.example/" },
            { url: "https://mail.example/" },
            { url: "https://b.example/" },
          ],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere(showsTemporaryTabs(3))
        yield* sidebar.run({ _tag: "PinTab", tabId: tabIds[1] })
        yield* sidebar.viewWhere(showsTemporaryTabs(2))

        yield* fake.openLink(tabIds[1], "https://link.example/")
        const view = yield* sidebar.viewWhere(showsTemporaryTabs(3))

        expect(temporaryUrls(view)).toStrictEqual(
          Option.some(["https://link.example/", "https://b.example/", "https://a.example/"]),
        )
      }),
    ),
  )

  it.live(
    "with new tabs shown at the bottom, a link opened from a temporary tab still shows right below it",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [
              { url: "https://a.example/" },
              { url: "https://b.example/" },
              { url: "https://c.example/" },
            ],
          })
          yield* showNewTabsAtTheBottom
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          yield* sidebar.viewWhere(showsTemporaryTabs(3))

          yield* fake.openLink(tabIds[1], "https://first.example/")
          yield* sidebar.viewWhere(showsTemporaryTabs(4))
          yield* fake.openLink(tabIds[1], "https://second.example/")
          const view = yield* sidebar.viewWhere(showsTemporaryTabs(5))

          expect(temporaryUrls(view)).toStrictEqual(
            Option.some([
              "https://a.example/",
              "https://b.example/",
              "https://second.example/",
              "https://first.example/",
              "https://c.example/",
            ]),
          )
        }),
      ),
  )

  it.live(
    "with new tabs shown at the bottom, a link opened from a pin still shows at the top",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [
              { url: "https://a.example/" },
              { url: "https://mail.example/" },
              { url: "https://b.example/" },
            ],
          })
          yield* showNewTabsAtTheBottom
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          yield* sidebar.viewWhere(showsTemporaryTabs(3))
          yield* sidebar.run({ _tag: "PinTab", tabId: tabIds[1] })
          yield* sidebar.viewWhere(showsTemporaryTabs(2))

          yield* fake.openLink(tabIds[1], "https://link.example/")
          const view = yield* sidebar.viewWhere(showsTemporaryTabs(3))

          expect(temporaryUrls(view)).toStrictEqual(
            Option.some(["https://link.example/", "https://a.example/", "https://b.example/"]),
          )
        }),
      ),
  )

  it.live("a new tab page Chrome opens with an opener stays where new tabs show", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://a.example/" }, { url: "https://b.example/" }],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere(showsTemporaryTabs(2))

        yield* (yield* Tabs).create({ windowId, url: "chrome://newtab/", openerTabId: tabIds[0] })
        const view = yield* sidebar.viewWhere(showsTemporaryTabs(3))

        expect(temporaryUrls(view)).toStrictEqual(
          Option.some(["chrome://newtab/", "https://b.example/", "https://a.example/"]),
        )
      }),
    ),
  )
})

describe("split view", () => {
  const entriesShape = (view: SidebarView) =>
    Option.match(spaceNamed(view, "Home"), {
      onNone: () => [],
      onSome: (space) =>
        space.temporaryEntries.map((entry) =>
          entry._tag === "TemporaryTab" ? entry.tab.title : entry.tabs.map((tab) => tab.title),
        ),
    })

  const pinnedSplits = (view: SidebarView) =>
    Option.match(spaceNamed(view, "Home"), {
      onNone: () => [],
      onSome: (space) =>
        space.pinned._tag === "Available"
          ? space.pinned.nodes.filter((node) => node._tag === "PinnedSplit")
          : [],
    })

  const splitIdIn = (view: SidebarView) =>
    Option.getOrThrow(
      Array.findFirst(Option.getOrThrow(spaceNamed(view, "Home")).temporaryEntries, (entry) =>
        entry._tag === "TemporarySplit" ? Option.some(entry.splitViewId) : Option.none(),
      ),
    )

  const seedThreeTabs = Effect.gen(function* () {
    const fake = yield* FakeBrowser
    return yield* fake.seedWindow({
      tabs: [
        { url: "https://a.example/", title: "A" },
        { url: "https://b.example/", title: "B" },
        { url: "https://c.example/", title: "C" },
      ],
    })
  })

  it.live(
    "dropping a tab onto another makes a split view, shown as one row in left-right order",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { windowId, tabIds } = yield* seedThreeTabs
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          yield* sidebar.viewWhere((v) => v.spaces.length === 1)

          const outcome = yield* sidebar.run({
            _tag: "SplitTabs",
            tabId: tabIds[2],
            withTabId: tabIds[0],
          })
          const view = yield* sidebar.viewWhere((v) => entriesShape(v).length === 2)

          // New tabs are shown on top by default, so the rows are in the reverse of Chrome's order
          expect([outcome._tag, entriesShape(view)]).toStrictEqual(["Succeeded", ["B", ["A", "C"]]])
        }),
      ),
  )

  it.live(
    "dropping while another tab is shown brings the dragged tab to the front, so the split view shows",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [
              { url: "https://a.example/", title: "A" },
              { url: "https://b.example/", title: "B", active: true },
              { url: "https://c.example/", title: "C" },
            ],
          })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          yield* sidebar.viewWhere((v) => v.spaces.length === 1)

          yield* sidebar.run({ _tag: "SplitTabs", tabId: tabIds[2], withTabId: tabIds[0] })
          const dragged = yield* (yield* Tabs).get(tabIds[2])

          expect([dragged.active, Option.isSome(dragged.splitViewId)]).toStrictEqual([true, true])
        }),
      ),
  )

  it.live("separating a split view turns it back into two single rows", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabIds } = yield* seedThreeTabs
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)
        yield* sidebar.run({ _tag: "SplitTabs", tabId: tabIds[1], withTabId: tabIds[0] })
        const split = yield* sidebar.viewWhere((v) => entriesShape(v).length === 2)

        yield* sidebar.run({
          _tag: "Unsplit",
          splitViewId: splitIdIn(split),
        })
        const view = yield* sidebar.viewWhere((v) => entriesShape(v).length === 3)

        expect(entriesShape(view)).toStrictEqual(["C", "B", "A"])
      }),
    ),
  )

  it.live("pinning a split view makes a split pin, which stays when its tabs close", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabIds } = yield* seedThreeTabs
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const initial = yield* sidebar.viewWhere((v) => v.spaces.length === 1)
        yield* sidebar.run({ _tag: "SplitTabs", tabId: tabIds[1], withTabId: tabIds[0] })
        const split = yield* sidebar.viewWhere((v) => entriesShape(v).length === 2)

        yield* sidebar.run({
          _tag: "PlaceSplitInPinned",
          splitViewId: splitIdIn(split),
          placement: { spaceId: initial.activeSpaceId, parentId: null, index: 0 },
        })
        yield* sidebar.viewWhere((v) => pinnedSplits(v).length === 1)
        yield* sidebar.run({ _tag: "CloseTab", tabId: tabIds[0] })
        yield* sidebar.run({ _tag: "CloseTab", tabId: tabIds[1] })
        const view = yield* sidebar.viewWhere((v) =>
          pinnedSplits(v).some((pin) => pin.items.every((item) => item.openTab === null)),
        )

        expect(
          pinnedSplits(view).map((pin) => [pin.title, pin.items.map((item) => item.title)]),
        ).toStrictEqual([["A | B", ["A", "B"]]])
      }),
    ),
  )

  it.live(
    "pinning one tab of a split view (from the shortcut or Spotlight) makes a split pin of both tabs",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { windowId, tabIds } = yield* seedThreeTabs
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          yield* sidebar.viewWhere((v) => v.spaces.length === 1)
          yield* sidebar.run({ _tag: "SplitTabs", tabId: tabIds[1], withTabId: tabIds[0] })
          yield* sidebar.viewWhere((v) => entriesShape(v).length === 2)

          yield* sidebar.run({ _tag: "PinTab", tabId: tabIds[0] })
          const view = yield* sidebar.viewWhere((v) => pinnedSplits(v).length === 1)

          expect({
            pins: pinnedSplits(view).map((pin) => pin.items.map((item) => item.title)),
            temporary: entriesShape(view),
          }).toStrictEqual({ pins: [["A", "B"]], temporary: ["C"] })
        }),
      ),
  )

  it.live("opening a closed split pin opens both tabs side by side in a split view", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabIds } = yield* seedThreeTabs
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const initial = yield* sidebar.viewWhere((v) => v.spaces.length === 1)
        yield* sidebar.run({ _tag: "SplitTabs", tabId: tabIds[1], withTabId: tabIds[0] })
        const split = yield* sidebar.viewWhere((v) => entriesShape(v).length === 2)
        yield* sidebar.run({
          _tag: "PlaceSplitInPinned",
          splitViewId: splitIdIn(split),
          placement: { spaceId: initial.activeSpaceId, parentId: null, index: 0 },
        })
        yield* sidebar.run({ _tag: "CloseTab", tabId: tabIds[0] })
        yield* sidebar.run({ _tag: "CloseTab", tabId: tabIds[1] })
        const closed = yield* sidebar.viewWhere((v) =>
          pinnedSplits(v).some((pin) => pin.items.every((item) => item.openTab === null)),
        )
        const pin = Option.getOrThrow(Array.head(pinnedSplits(closed)))

        yield* sidebar.run({ _tag: "OpenPinnedItem", windowId, bookmarkId: pin.bookmarkId })
        const view = yield* sidebar.viewWhere((v) =>
          pinnedSplits(v).some((p) => p.items.every((item) => item.openTab !== null)),
        )
        const reopened = Option.getOrThrow(Array.head(pinnedSplits(view)))
        const [left, right] = reopened.items.map((item) => item.openTab?.tab.splitViewId ?? null)

        expect([left !== null, left === right]).toStrictEqual([true, true])
      }),
    ),
  )
})

describe("moving folders", () => {
  const pinnedNodesOf = (view: SidebarView, spaceName: string): ReadonlyArray<PinnedNodeView> =>
    Option.match(spaceNamed(view, spaceName), {
      onNone: () => [],
      onSome: (space) => (space.pinned._tag === "Available" ? space.pinned.nodes : []),
    })

  const createdIdOf = (outcome: CommandOutcome) =>
    outcome._tag === "Succeeded" && outcome.createdBookmarkId !== null
      ? Effect.succeed(outcome.createdBookmarkId)
      : Effect.die(new Error("couldn't create the folder"))

  it.live(
    "moving a folder into a folder of another Space moves the open tabs of its pins to that Space too",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [{ url: "https://mail.example/", title: "Mail" }, { url: "https://b.example/" }],
          })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          const home = (yield* sidebar.viewWhere((v) => v.spaces.length === 1)).activeSpaceId
          const folderId = yield* createdIdOf(
            yield* sidebar.run({ _tag: "CreateFolder", spaceId: home, parentId: null }),
          )
          yield* sidebar.run({
            _tag: "PlaceTabInPinned",
            tabId: tabIds[0],
            placement: { spaceId: home, parentId: folderId, index: 0 },
          })
          yield* sidebar.run({ _tag: "CreateSpace", windowId })
          const work = Option.getOrThrow(
            spaceNamed(yield* sidebar.viewWhere((v) => v.spaces.length === 2), "Space 2"),
          ).id
          const targetId = yield* createdIdOf(
            yield* sidebar.run({ _tag: "CreateFolder", spaceId: work, parentId: null }),
          )

          const outcome = yield* sidebar.run({
            _tag: "MovePinnedItem",
            bookmarkId: folderId,
            placement: { spaceId: work, parentId: targetId, index: 0 },
          })
          const openPinsInMovedFolder = (view: SidebarView) =>
            pinnedNodesOf(view, "Space 2").flatMap((target) =>
              target._tag === "PinnedFolder"
                ? target.children.flatMap((moved) =>
                    moved._tag === "PinnedFolder"
                      ? moved.children.flatMap((pin) =>
                          pin._tag === "PinnedItem" && pin.openTab !== null
                            ? [[pin.title, pin.openTab.tab.tabId] as const]
                            : [],
                        )
                      : [],
                  )
                : [],
            )
          const view = yield* sidebar.viewWhere((v) => openPinsInMovedFolder(v).length > 0)

          expect({
            outcome: outcome._tag,
            moved: openPinsInMovedFolder(view),
            leftInHome: pinnedNodesOf(view, "Home").length,
          }).toStrictEqual({
            outcome: "Succeeded",
            moved: [["Mail", tabIds[0]]],
            leftInHome: 0,
          })
        }),
      ),
  )

  it.live(
    "moving a folder that holds folders beyond the depth limit is refused with a reason",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          const home = (yield* sidebar.viewWhere((v) => v.spaces.length === 1)).activeSpaceId
          const outer = yield* createdIdOf(
            yield* sidebar.run({ _tag: "CreateFolder", spaceId: home, parentId: null }),
          )
          yield* sidebar.run({ _tag: "CreateFolder", spaceId: home, parentId: outer })
          const target = yield* createdIdOf(
            yield* sidebar.run({ _tag: "CreateFolder", spaceId: home, parentId: null }),
          )

          const outcome = yield* sidebar.run({
            _tag: "MovePinnedItem",
            bookmarkId: outer,
            placement: { spaceId: home, parentId: target, index: 0 },
          })

          expect(outcome).toStrictEqual({
            _tag: "Failed",
            reason: "It can't be moved any deeper",
          })
        }),
      ),
  )

  it.live("moving a folder into a folder inside itself is refused with a reason", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const home = (yield* sidebar.viewWhere((v) => v.spaces.length === 1)).activeSpaceId
        const outer = yield* createdIdOf(
          yield* sidebar.run({ _tag: "CreateFolder", spaceId: home, parentId: null }),
        )
        const inner = yield* createdIdOf(
          yield* sidebar.run({ _tag: "CreateFolder", spaceId: home, parentId: outer }),
        )

        const outcome = yield* sidebar.run({
          _tag: "MovePinnedItem",
          bookmarkId: outer,
          placement: { spaceId: home, parentId: inner, index: 0 },
        })

        expect(outcome).toStrictEqual({
          _tag: "Failed",
          reason: "A folder can't be moved into itself",
        })
      }),
    ),
  )
})

describe("folder icons", () => {
  const homeFolders = (view: SidebarView) =>
    Option.match(spaceNamed(view, "Home"), {
      onNone: () => [],
      onSome: (space) =>
        space.pinned._tag === "Available"
          ? space.pinned.nodes.filter((node) => node._tag === "PinnedFolder")
          : [],
    })

  const createFolderIn = (sidebar: Effect.Success<ReturnType<typeof openSidebar>>) =>
    Effect.gen(function* () {
      const home = (yield* sidebar.viewWhere((v) => v.spaces.length === 1)).activeSpaceId
      const outcome = yield* sidebar.run({ _tag: "CreateFolder", spaceId: home, parentId: null })
      return outcome._tag === "Succeeded" && outcome.createdBookmarkId !== null
        ? outcome.createdBookmarkId
        : yield* Effect.die(new Error("couldn't create the folder"))
    })

  it.live("the icon chosen for a folder shows on the folder in the view", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const folderId = yield* createFolderIn(sidebar)

        yield* sidebar.run({ _tag: "SetFolderIcon", bookmarkId: folderId, icon: "planet" })
        const view = yield* sidebar.viewWhere((v) =>
          homeFolders(v).some((folder) => folder.icon !== null),
        )

        expect(homeFolders(view).map((folder) => folder.icon)).toStrictEqual(["planet"])
      }),
    ),
  )

  it.live("a folder whose icon was removed has no icon in the view", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const folderId = yield* createFolderIn(sidebar)
        yield* sidebar.run({ _tag: "SetFolderIcon", bookmarkId: folderId, icon: "planet" })
        yield* sidebar.viewWhere((v) => homeFolders(v).some((folder) => folder.icon !== null))

        yield* sidebar.run({ _tag: "SetFolderIcon", bookmarkId: folderId, icon: null })
        const view = yield* sidebar.viewWhere((v) =>
          homeFolders(v).every((folder) => folder.icon === null),
        )

        expect(homeFolders(view).map((folder) => folder.icon)).toStrictEqual([null])
      }),
    ),
  )

  it.live("setting an icon on a pin that isn't a folder is refused with a reason", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/" }, { url: "https://b.example/" }],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)
        yield* sidebar.run({ _tag: "PinTab", tabId: tabIds[0] })
        const pinned = yield* sidebar.viewWhere((v) => pinnedItems(v, "Home").length === 1)
        const pin = Option.getOrThrow(Array.head(pinnedItems(pinned, "Home")))

        const outcome = yield* sidebar.run({
          _tag: "SetFolderIcon",
          bookmarkId: pin.bookmarkId,
          icon: "star",
        })

        expect(outcome).toStrictEqual({ _tag: "Failed", reason: "Folder not found" })
      }),
    ),
  )
})

describe("when a Chrome API doesn't respond", () => {
  it.live("an operation past the time limit is cut off, and later operations still run", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://a.example/" }, { url: "https://b.example/" }],
        })
        const createSplitNeverReturns = Layer.effect(
          Tabs,
          Tabs.useSync((tabs) => Tabs.of({ ...tabs, createSplit: () => Effect.never })),
        )
        yield* startBackground.pipe(
          Effect.provide(createSplitNeverReturns),
          Effect.provideService(OperationTimeLimit, "200 millis"),
        )
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)

        const split = yield* sidebar.run({
          _tag: "SplitTabs",
          tabId: tabIds[1],
          withTabId: tabIds[0],
        })
        const activate = yield* sidebar.run({ _tag: "ActivateTab", tabId: tabIds[1] })

        expect([split, activate._tag]).toStrictEqual([
          { _tag: "Failed", reason: "Didn't finish in time" },
          "Succeeded",
        ])
      }),
    ),
  )
})

describe("Chrome without the split view API", () => {
  it.live("the view says splitting isn't possible, and splitting is refused with a reason", () =>
    Effect.gen(function* () {
      const fake = yield* FakeBrowser
      const { windowId, tabIds } = yield* fake.seedWindow({
        tabs: [{ url: "https://a.example/" }, { url: "https://b.example/" }],
      })
      yield* startBackground
      const sidebar = yield* openSidebar(windowId)
      const view = yield* sidebar.viewWhere((v) => v.spaces.length === 1)

      const outcome = yield* sidebar.run({
        _tag: "SplitTabs",
        tabId: tabIds[1],
        withTabId: tabIds[0],
      })

      expect([view.canSplit, outcome]).toStrictEqual([
        false,
        { _tag: "Failed", reason: "Split view isn't available in this version of Chrome" },
      ])
    }).pipe(
      Effect.scoped,
      Effect.provide(backgroundTestLayerWith(FakeBrowser.layerWith({ supportsSplitView: false }))),
    ),
  )
})

describe("Spotlight", () => {
  it.live(
    "opened from the side panel, it opens in a popup window apart from the calling window",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          yield* sidebar.viewWhere((v) => v.spaces.length === 1)

          const outcome = yield* sidebar.run({ _tag: "OpenSpotlight", windowId })
          const windows = (yield* fake.snapshot).windows

          expect([
            outcome._tag,
            windows
              .filter((window) => window.id !== windowId)
              .map((window) => Option.getOrNull(window.type)),
          ]).toStrictEqual(["Succeeded", ["popup"]])
        }),
      ),
  )
})

describe("copy shortcuts", () => {
  const pageNoticesIn = (tabId: TabId) =>
    Effect.map(
      FakeScripting.use((scripting) => scripting.functionExecutions),
      (executions) =>
        executions.flatMap((execution) =>
          execution.tabId === tabId && execution.name === "showPageToast" ? execution.args : [],
        ),
    )

  const pressShortcut = Effect.fnUntraced(function* (command: string, tab: BrowserTab) {
    yield* (yield* FakeBrowser).emit({ _tag: "CommandTriggered", command, tab: Option.some(tab) })
  })

  /** Saves the copy shortcut settings the way the options page does, while Katip is running. */
  const turnOn = (pageShortcuts: { readonly copyUrl?: true; readonly copyMarkdownLink?: true }) =>
    Storage.use((storage) => storage.sync.set("katip/settings", { pageShortcuts }))

  const startWithPage = (page: TabSeed) =>
    Effect.gen(function* () {
      const fake = yield* FakeBrowser
      const { windowId, tabIds } = yield* fake.seedWindow({ tabs: [{ ...page, active: true }] })
      yield* startBackground
      const sidebar = yield* openSidebar(windowId)
      yield* sidebar.viewWhere((v) => v.spaces.length === 1)
      return { sidebar, tab: yield* (yield* Tabs).get(tabIds[0]) }
    })

  const noticesShownIn = (tabId: TabId) =>
    eventually(
      Effect.map(
        pageNoticesIn(tabId),
        Option.liftPredicate((all) => all.length > 0),
      ),
    )

  // Commands run one at a time in the order pressed, so once a later pin toggle has pinned the
  // tab, every shortcut pressed before it has finished
  const pressPinToggleAndWait = Effect.fnUntraced(function* (tab: BrowserTab) {
    yield* pressShortcut("quick-pin-toggle", tab)
    yield* eventually(
      Effect.map(
        Bookmarks.use((bookmarks) => bookmarks.search({ url: Option.getOrThrow(tab.url) })),
        Option.liftPredicate((found) => found.length > 0),
      ),
    )
  })

  it.live(
    "copy-current-url, once turned on in the settings, copies the active tab's URL and shows a notice on that page",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { tab } = yield* startWithPage({ url: "https://copy.example/page?q=1" })
          yield* turnOn({ copyUrl: true })

          yield* pressShortcut("copy-current-url", tab)
          const notices = yield* noticesShownIn(tab.id)

          expect([yield* (yield* ClipboardRecorder).written, notices]).toStrictEqual([
            ["https://copy.example/page?q=1"],
            ["Copied URL"],
          ])
        }),
      ),
  )

  it.live("copy-current-url-as-markdown, once turned on in the settings, copies [title](URL)", () =>
    inBackground(
      Effect.gen(function* () {
        const { tab } = yield* startWithPage({
          url: "https://copy.example/page",
          title: "Release notes",
        })
        yield* turnOn({ copyMarkdownLink: true })

        yield* pressShortcut("copy-current-url-as-markdown", tab)
        const notices = yield* noticesShownIn(tab.id)

        expect([yield* (yield* ClipboardRecorder).written, notices]).toStrictEqual([
          ["[Release notes](https://copy.example/page)"],
          ["Copied Markdown link"],
        ])
      }),
    ),
  )

  it.live(
    "with the default settings, neither copy shortcut copies anything or shows a notice",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { tab } = yield* startWithPage({ url: "https://copy.example/" })

          yield* pressShortcut("copy-current-url", tab)
          yield* pressShortcut("copy-current-url-as-markdown", tab)
          yield* pressPinToggleAndWait(tab)

          expect([
            yield* (yield* ClipboardRecorder).written,
            yield* pageNoticesIn(tab.id),
          ]).toStrictEqual([[], []])
        }),
      ),
  )

  it.live("turning on one copy shortcut leaves the other one off", () =>
    inBackground(
      Effect.gen(function* () {
        const { tab } = yield* startWithPage({ url: "https://copy.example/", title: "Docs" })
        yield* turnOn({ copyMarkdownLink: true })

        yield* pressShortcut("copy-current-url", tab)
        yield* pressShortcut("copy-current-url-as-markdown", tab)
        yield* pressPinToggleAndWait(tab)

        expect(yield* (yield* ClipboardRecorder).written).toStrictEqual([
          "[Docs](https://copy.example/)",
        ])
      }),
    ),
  )

  it.live(
    "shows the notice in the side panel when it can't be shown on the page (such as a chrome:// page)",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { sidebar, tab } = yield* startWithPage({ url: "https://copy.example/" })
          yield* turnOn({ copyUrl: true })
          yield* (yield* FakeScripting).failNextInjectionInto(tab.id)

          yield* pressShortcut("copy-current-url", tab)
          const notice = yield* sidebar.noticeWhere(() => true)

          expect([notice, yield* pageNoticesIn(tab.id)]).toStrictEqual(["Copied URL", []])
        }),
      ),
  )

  it.live("on a tab without a URL, copies nothing and says it couldn't copy", () =>
    inBackground(
      Effect.gen(function* () {
        const { tab } = yield* startWithPage({ url: "https://copy.example/" })
        yield* turnOn({ copyUrl: true })

        yield* pressShortcut("copy-current-url", {
          ...tab,
          url: Option.none(),
          pendingUrl: Option.none(),
        })
        const notices = yield* noticesShownIn(tab.id)

        expect([yield* (yield* ClipboardRecorder).written, notices]).toStrictEqual([
          [],
          ["Couldn’t copy"],
        ])
      }),
    ),
  )
})

describe("auto archive", () => {
  it.live("a temporary tab unused for longer than the threshold is archived and closed", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [
            { url: "https://active.example/", active: true },
            { url: "https://stale.example/", title: "Stale tab" },
          ],
        })
        yield* fake.seedStorage("sync", {
          "katip/settings": { autoArchive: { enabled: true, idleMinutes: 1 } },
        })
        yield* fake.seedStorage("local", {
          "katip/spaces": [{ id: "home", name: "Home", color: "grey" }],
        })
        yield* fake.seedStorage("session", {
          "katip/workspace": {
            tabs: tabIds.map((tabId) => ({
              tabId,
              spaceId: "home",
              pinned: null,
              titleOverride: null,
              lastActiveAt: 0,
            })),
            windows: [{ windowId, activeSpaceId: "home" }],
          },
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)
        // The first view arrives without waiting for startup reconciliation, so wait for the alarm
        // to be scheduled separately
        yield* eventually(
          Effect.map(
            Alarms.use((alarms) => alarms.getAll),
            (all) => Array.findFirst(all, (alarm) => alarm.name === "katip/auto-archive"),
          ),
        )

        yield* fake.fireAlarm("katip/auto-archive")
        const view = yield* sidebar.viewWhere((v) => v.archive.length === 1)

        expect({
          archived: view.archive.map((entry) => entry.title),
          open: temporaryTitles(view, "Home").pipe(Option.map((titles) => titles.length)),
          closedTabStillExists: (yield* fake.snapshot).tabs.some(
            (tab) => tab.id === TabId.make(tabIds[1]),
          ),
        }).toStrictEqual({
          archived: ["Stale tab"],
          open: Option.some(1),
          closedTabStillExists: false,
        })
      }),
    ),
  )
})
