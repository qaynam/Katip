import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, Layer, Option, Order, type Scope } from "effect"
import type { FavoriteId } from "#modules/favorites"
import { Storage, Tabs, type BrowserTab, type TabId, type WindowId } from "#platform/browser"
import { FakeBrowser, type TabSeed } from "#platform/browser-testing"
import type { SidebarView, SpaceView } from "#protocol"
import {
  backgroundTestLayer,
  openSidebar,
  spaceNamed,
  startBackground,
} from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const shownSpace = (view: SidebarView): SpaceView =>
  Option.getOrThrow(Array.findFirst(view.spaces, (space) => space.id === view.activeSpaceId))

const shownFavorites = (view: SidebarView) => shownSpace(view).favorites

const favoritesOf = (space: SpaceView) =>
  space.favorites.map((favorite) => [favorite.title, favorite.openTab === null ? "closed" : "open"])

const shownFavoritesOf = (view: SidebarView) => favoritesOf(shownSpace(view))

const favoritesIn = (view: SidebarView, name: string) =>
  Option.map(spaceNamed(view, name), favoritesOf)

const favoriteIdOf = (view: SidebarView, title: string): FavoriteId =>
  Option.getOrThrow(
    Option.flatMap(
      Array.findFirst(
        view.spaces.flatMap((space) => space.favorites),
        (favorite) => favorite.title === title,
      ),
      (favorite) => Option.fromNullishOr(favorite.favoriteId),
    ),
  )

const byIndex = Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index)

const pinnedUrlsIn = (windowId: WindowId) =>
  Effect.map(
    Tabs.use((tabs) => tabs.query({ windowId, pinned: true })),
    (tabs) => Array.sort(tabs, byIndex).map((tab) => Option.getOrNull(tab.url)),
  )

const isPinned = (tabId: TabId) =>
  Effect.map(
    Tabs.use((tabs) => tabs.get(tabId)),
    (tab) => tab.pinned,
  )

const temporaryTitlesIn = (view: SidebarView, name: string) =>
  Option.match(spaceNamed(view, name), {
    onNone: (): ReadonlyArray<string> => [],
    onSome: (space) =>
      space.temporaryEntries.flatMap((entry) =>
        entry._tag === "TemporaryTab" ? [entry.tab.title] : entry.tabs.map((tab) => tab.title),
      ),
  })

const temporaryTitlesInHome = (view: SidebarView) => temporaryTitlesIn(view, "Home")

/** A window holding pinned tabs titled `pinned`, at https://<title>.example/, then one other tab. */
const startWithFavorites = (...pinned: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fake = yield* FakeBrowser
    const window = yield* fake.seedWindow({
      tabs: Array.append(
        pinned.map((title): TabSeed => ({ url: `https://${title}.example/`, title, pinned: true })),
        { url: "https://other.example/", title: "Other", active: true },
      ),
    })
    yield* startBackground
    const sidebar = yield* openSidebar(window.windowId)
    const view = yield* sidebar.viewWhere((v) => shownFavorites(v).length === pinned.length)
    const tabAt = (index: number): TabId => Option.getOrThrow(Array.get(window.tabIds, index))
    return { windowId: window.windowId, tabAt, sidebar, view }
  })

/** {@link startWithFavorites}, then a second Space named Work created and shown. */
const startWithFavoritesAndWork = (...pinned: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const started = yield* startWithFavorites(...pinned)
    yield* started.sidebar.run({ _tag: "CreateSpace", windowId: started.windowId })
    const view = yield* started.sidebar.viewWhere((v) =>
      spaceNamed(v, "Space 2").pipe(Option.isSome),
    )
    const work = Option.getOrThrow(spaceNamed(view, "Space 2"))
    return { ...started, view, workId: work.id, homeId: started.view.activeSpaceId }
  })

describe("Favorites", () => {
  it.live("closing a Favorite's tab keeps the Favorite, closed", () =>
    inBackground(
      Effect.gen(function* () {
        const { tabAt, sidebar } = yield* startWithFavorites("Mail", "Docs")

        yield* Tabs.use((tabs) => tabs.remove([tabAt(0)]))
        const view = yield* sidebar.viewWhere((v) => shownFavorites(v)[0]?.openTab === null)

        expect([shownFavoritesOf(view), temporaryTitlesInHome(view)]).toStrictEqual([
          [
            ["Mail", "closed"],
            ["Docs", "open"],
          ],
          ["Other"],
        ])
      }),
    ),
  )

  it.live("opening a closed Favorite opens its page at its place among the pinned tabs", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabAt, sidebar } = yield* startWithFavorites("a", "b", "c")
        yield* Tabs.use((tabs) => tabs.remove([tabAt(1)]))
        const closed = yield* sidebar.viewWhere((v) => shownFavorites(v)[1]?.openTab === null)

        yield* sidebar.run({
          _tag: "OpenFavorite",
          windowId,
          favoriteId: favoriteIdOf(closed, "b"),
        })
        const view = yield* sidebar.viewWhere(
          (v) => shownFavorites(v)[1]?.openTab?.isActive === true,
        )

        expect([shownFavoritesOf(view), yield* pinnedUrlsIn(windowId)]).toStrictEqual([
          [
            ["a", "open"],
            ["b", "open"],
            ["c", "open"],
          ],
          ["https://a.example/", "https://b.example/", "https://c.example/"],
        ])
      }),
    ),
  )

  it.live(
    "tabs pinned before Katip starts become Favorites of the Space shown, keeping each window's order, the same page in two windows once",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const first = yield* fake.seedWindow({
            tabs: [
              { url: "https://a.example/", title: "a", pinned: true },
              { url: "https://b.example/", title: "b", pinned: true },
              {},
            ],
          })
          const second = yield* fake.seedWindow({
            tabs: [
              { url: "https://a.example/", title: "a", pinned: true },
              { url: "https://c.example/", title: "c", pinned: true },
              {},
            ],
          })
          yield* startBackground

          const firstView = yield* (yield* openSidebar(first.windowId)).viewWhere(
            (v) => shownFavorites(v).length === 3,
          )
          const secondView = yield* (yield* openSidebar(second.windowId)).viewWhere(
            (v) => shownFavorites(v).length === 3,
          )

          expect([shownFavoritesOf(firstView), shownFavoritesOf(secondView)]).toStrictEqual([
            [
              ["a", "open"],
              ["c", "closed"],
              ["b", "open"],
            ],
            [
              ["a", "open"],
              ["c", "open"],
              ["b", "closed"],
            ],
          ])
        }),
      ),
  )

  it.live(
    "after a browser restart, a Favorite gets its tab back even when the tab had left the Favorite's page",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedStorage("local", {
            "katip/spaces": [{ id: "home", name: "Home", color: "grey" }],
            "katip/space-favorites": {
              home: [{ id: "mail", url: "https://mail.example/", title: "Mail" }],
            },
            "katip/favorite-restore-snapshot": [
              { url: "https://mail.example/inbox/42", favoriteId: "mail", isPinned: true },
            ],
          })
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [{ url: "https://mail.example/inbox/42", title: "Inbox", pinned: true }, {}],
          })
          yield* startBackground

          const view = yield* (yield* openSidebar(windowId)).viewWhere(
            (v) => shownFavorites(v)[0]?.openTab !== null,
          )

          expect(
            shownFavorites(view).map((favorite) => [favorite.favoriteId, favorite.openTab?.tabId]),
          ).toStrictEqual([["mail", tabIds[0]]])
        }),
      ),
  )

  it.live("adding a tab to Favorites at a place pins it at the matching place", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabAt, sidebar, view: before } = yield* startWithFavorites("a", "b")

        yield* sidebar.run({
          _tag: "AddToFavorites",
          tabId: tabAt(2),
          spaceId: before.activeSpaceId,
          index: 1,
        })
        const view = yield* sidebar.viewWhere((v) => shownFavorites(v).length === 3)

        expect([shownFavoritesOf(view), yield* pinnedUrlsIn(windowId)]).toStrictEqual([
          [
            ["a", "open"],
            ["Other", "open"],
            ["b", "open"],
          ],
          ["https://a.example/", "https://other.example/", "https://b.example/"],
        ])
      }),
    ),
  )

  it.live("moving a Favorite moves its tab among the pinned tabs", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, sidebar, view: before } = yield* startWithFavorites("a", "b", "c")

        yield* sidebar.run({
          _tag: "MoveFavorite",
          favoriteId: favoriteIdOf(before, "a"),
          toIndex: 2,
        })
        const view = yield* sidebar.viewWhere((v) => shownFavorites(v)[2]?.title === "a")

        expect([
          shownFavoritesOf(view).map(([title]) => title),
          yield* pinnedUrlsIn(windowId),
        ]).toStrictEqual([
          ["b", "c", "a"],
          ["https://b.example/", "https://c.example/", "https://a.example/"],
        ])
      }),
    ),
  )

  it.live("reordering pinned tabs in Chrome's tab strip reorders the Favorites", () =>
    inBackground(
      Effect.gen(function* () {
        const { tabAt, sidebar } = yield* startWithFavorites("a", "b", "c")

        yield* Tabs.use((tabs) => tabs.move([tabAt(2)], { index: 0 }))
        const view = yield* sidebar.viewWhere((v) => shownFavorites(v)[0]?.title === "c")

        expect(shownFavoritesOf(view).map(([title]) => title)).toStrictEqual(["c", "a", "b"])
      }),
    ),
  )

  it.live("removing a Favorite keeps its tab open as a temporary tab of the Space shown", () =>
    inBackground(
      Effect.gen(function* () {
        const { sidebar, view: before } = yield* startWithFavorites("Mail")

        yield* sidebar.run({ _tag: "RemoveFavorite", favoriteId: favoriteIdOf(before, "Mail") })
        const view = yield* sidebar.viewWhere((v) => temporaryTitlesInHome(v).includes("Mail"))

        expect(shownFavorites(view)).toStrictEqual([])
      }),
    ),
  )

  it.live("taking a Favorite's tab into the Space's temporary tabs removes the Favorite", () =>
    inBackground(
      Effect.gen(function* () {
        const { tabAt, sidebar, view: before } = yield* startWithFavorites("Mail")

        yield* sidebar.run({
          _tag: "PlaceTabInTemporary",
          tabId: tabAt(0),
          spaceId: before.activeSpaceId,
          placement: { _tag: "Top" },
        })
        const view = yield* sidebar.viewWhere((v) => temporaryTitlesInHome(v).includes("Mail"))

        expect(shownFavorites(view)).toStrictEqual([])
      }),
    ),
  )

  // Chrome unpins a tab right before closing it too, so unpinning alone can't remove the Favorite
  it.live("unpinning a Favorite's tab in Chrome's tab strip keeps the Favorite, closed", () =>
    inBackground(
      Effect.gen(function* () {
        const { tabAt, sidebar } = yield* startWithFavorites("Mail")

        yield* Tabs.use((tabs) => tabs.update(tabAt(0), { pinned: false }))
        const view = yield* sidebar.viewWhere((v) => temporaryTitlesInHome(v).includes("Mail"))

        expect(shownFavoritesOf(view)).toStrictEqual([["Mail", "closed"]])
      }),
    ),
  )
})

describe("each Space's own Favorites", () => {
  it.live("a new Space starts with no Favorites, while the other Space keeps its own", () =>
    inBackground(
      Effect.gen(function* () {
        const { view } = yield* startWithFavoritesAndWork("Mail", "Docs")

        expect([favoritesIn(view, "Space 2"), favoritesIn(view, "Home")]).toStrictEqual([
          Option.some([]),
          Option.some([
            ["Mail", "open"],
            ["Docs", "open"],
          ]),
        ])
      }),
    ),
  )

  it.live(
    "switching Spaces unpins the Favorites' tabs of the Space left, keeping them open, and pins those of the Space shown",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { windowId, tabAt, sidebar, homeId, workId } =
            yield* startWithFavoritesAndWork("Mail")
          const chat = yield* Tabs.use((tabs) =>
            tabs.create({ windowId, url: "https://chat.example/", active: true }),
          )
          yield* sidebar.viewWhere((v) => temporaryTitlesIn(v, "Space 2").length === 2)
          yield* sidebar.run({ _tag: "AddToFavorites", tabId: chat.id, spaceId: workId })
          yield* sidebar.viewWhere((v) => shownFavorites(v).length === 1)
          const atWork = [yield* pinnedUrlsIn(windowId), yield* isPinned(tabAt(0))]

          yield* sidebar.run({ _tag: "SwitchSpace", windowId, spaceId: homeId })
          const view = yield* sidebar.viewWhere((v) => v.activeSpaceId === homeId)

          expect({
            atWork,
            atHome: [yield* pinnedUrlsIn(windowId), yield* isPinned(chat.id)],
            work: favoritesIn(view, "Space 2"),
            home: favoritesIn(view, "Home"),
          }).toStrictEqual({
            atWork: [["https://chat.example/"], false],
            atHome: [["https://Mail.example/"], false],
            work: Option.some([["https://chat.example/", "open"]]),
            home: Option.some([["Mail", "open"]]),
          })
        }),
      ),
  )

  it.live(
    "switching back to a Space pins the same tabs of its Favorites again, in their order",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { windowId, tabAt, sidebar, homeId } = yield* startWithFavoritesAndWork("a", "b")

          yield* sidebar.run({ _tag: "SwitchSpace", windowId, spaceId: homeId })
          yield* sidebar.viewWhere((v) => v.activeSpaceId === homeId)

          expect([
            yield* pinnedUrlsIn(windowId),
            yield* isPinned(tabAt(0)),
            yield* isPinned(tabAt(1)),
          ]).toStrictEqual([["https://a.example/", "https://b.example/"], true, true])
        }),
      ),
  )

  it.live("the same page can be a Favorite of two Spaces, each with its own tab", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabAt, sidebar, workId } = yield* startWithFavoritesAndWork("Mail")
        const tab = yield* Tabs.use((tabs) =>
          tabs.create({ windowId, url: "https://Mail.example/", active: true }),
        )
        yield* sidebar.viewWhere((v) => temporaryTitlesIn(v, "Space 2").length === 2)

        yield* sidebar.run({ _tag: "AddToFavorites", tabId: tab.id, spaceId: workId })
        const view = yield* sidebar.viewWhere((v) => shownFavorites(v).length === 1)

        expect({
          home: Option.map(spaceNamed(view, "Home"), (space) =>
            space.favorites.map((favorite) => favorite.openTab?.tabId),
          ),
          work: shownFavorites(view).map((favorite) => favorite.openTab?.tabId),
          pinned: yield* pinnedUrlsIn(windowId),
          homeTabPinned: yield* isPinned(tabAt(0)),
        }).toStrictEqual({
          home: Option.some([tabAt(0)]),
          work: [tab.id],
          pinned: ["https://Mail.example/"],
          homeTabPinned: false,
        })
      }),
    ),
  )

  it.live("moving and removing a Favorite change only its own Space's", () =>
    inBackground(
      Effect.gen(function* () {
        const {
          windowId,
          sidebar,
          homeId,
          workId,
          view: before,
        } = yield* startWithFavoritesAndWork("a", "b", "d")
        const created = yield* Tabs.use((tabs) =>
          tabs.create({ windowId, url: "https://c.example/", active: false }),
        )
        yield* sidebar.viewWhere((v) => temporaryTitlesIn(v, "Space 2").length === 2)
        yield* sidebar.run({ _tag: "AddToFavorites", tabId: created.id, spaceId: workId })
        yield* sidebar.viewWhere((v) => shownFavorites(v).length === 1)

        yield* sidebar.run({
          _tag: "MoveFavorite",
          favoriteId: favoriteIdOf(before, "a"),
          toIndex: 2,
        })
        yield* sidebar.run({ _tag: "RemoveFavorite", favoriteId: favoriteIdOf(before, "b") })
        yield* sidebar.run({ _tag: "SwitchSpace", windowId, spaceId: homeId })
        const view = yield* sidebar.viewWhere(
          (v) => v.activeSpaceId === homeId && shownFavorites(v).length === 2,
        )

        expect([
          favoritesIn(view, "Home"),
          favoritesIn(view, "Space 2"),
          yield* pinnedUrlsIn(windowId),
        ]).toStrictEqual([
          Option.some([
            ["d", "open"],
            ["a", "open"],
          ]),
          Option.some([["https://c.example/", "open"]]),
          ["https://d.example/", "https://a.example/"],
        ])
      }),
    ),
  )

  it.live(
    "activating a Favorite's unpinned tab, as from Chrome's tab strip, shows its Space and pins it",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { windowId, tabAt, sidebar, homeId } = yield* startWithFavoritesAndWork("Mail")

          yield* Tabs.use((tabs) => tabs.update(tabAt(0), { active: true }))
          const view = yield* sidebar.viewWhere((v) => v.activeSpaceId === homeId)

          expect([shownFavoritesOf(view), yield* pinnedUrlsIn(windowId)]).toStrictEqual([
            [["Mail", "open"]],
            ["https://Mail.example/"],
          ])
        }),
      ),
  )

  it.live(
    "opening a closed Favorite of another Space, as from Spotlight, switches to its Space",
    () =>
      inBackground(
        Effect.gen(function* () {
          const {
            windowId,
            tabAt,
            sidebar,
            homeId,
            view: before,
          } = yield* startWithFavoritesAndWork("Mail")
          yield* Tabs.use((tabs) => tabs.remove([tabAt(0)]))
          yield* sidebar.viewWhere((v) =>
            Option.exists(favoritesIn(v, "Home"), (favorites) => favorites[0]?.[1] === "closed"),
          )

          yield* sidebar.run({
            _tag: "OpenFavorite",
            windowId,
            favoriteId: favoriteIdOf(before, "Mail"),
          })
          const view = yield* sidebar.viewWhere(
            (v) => v.activeSpaceId === homeId && shownFavorites(v)[0]?.openTab?.isActive === true,
          )

          expect([shownFavoritesOf(view), yield* pinnedUrlsIn(windowId)]).toStrictEqual([
            [["Mail", "open"]],
            ["https://Mail.example/"],
          ])
        }),
      ),
  )

  it.live(
    "switching to a Space with only its Favorites open brings the one used last forward rather than a new tab",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [{ url: "https://mail.example/", title: "Mail", pinned: true, active: true }],
          })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          const before = yield* sidebar.viewWhere((v) => shownFavorites(v).length === 1)
          yield* sidebar.run({ _tag: "CreateSpace", windowId })
          yield* sidebar.viewWhere((v) => v.activeSpaceId !== before.activeSpaceId)
          const tabCount = (yield* Tabs.use((tabs) => tabs.query({ windowId }))).length

          yield* sidebar.run({ _tag: "SwitchSpace", windowId, spaceId: before.activeSpaceId })
          yield* sidebar.viewWhere((v) => v.activeSpaceId === before.activeSpaceId)

          const tabs = yield* Tabs.use((all) => all.query({ windowId }))
          expect([tabs.length, tabs.find((tab) => tab.active)?.id]).toStrictEqual([
            tabCount,
            tabIds[0],
          ])
        }),
      ),
  )

  it.live(
    "deleting a Space removes its Favorites and keeps their tabs open as temporary tabs of the remaining Space",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { windowId, sidebar, homeId } = yield* startWithFavoritesAndWork("Mail")
          yield* sidebar.run({ _tag: "SwitchSpace", windowId, spaceId: homeId })
          yield* sidebar.viewWhere((v) => v.activeSpaceId === homeId)

          yield* sidebar.run({ _tag: "DeleteSpace", spaceId: homeId })
          const view = yield* sidebar.viewWhere(
            (v) => v.spaces.length === 1 && temporaryTitlesIn(v, "Space 2").includes("Mail"),
          )

          expect([favoritesIn(view, "Space 2"), yield* pinnedUrlsIn(windowId)]).toStrictEqual([
            Option.some([]),
            [],
          ])
        }),
      ),
  )

  it.live(
    "pinning in Chrome an unpinned tab of another Space's Favorite makes it a Favorite of the Space shown",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { tabAt, sidebar } = yield* startWithFavoritesAndWork("Mail")

          yield* Tabs.use((tabs) => tabs.update(tabAt(0), { pinned: true }))
          const view = yield* sidebar.viewWhere((v) => shownFavorites(v).length === 1)

          expect([favoritesIn(view, "Space 2"), favoritesIn(view, "Home")]).toStrictEqual([
            Option.some([["Mail", "open"]]),
            Option.some([["Mail", "closed"]]),
          ])
        }),
      ),
  )

  it.live(
    "after a browser restart, a Favorite's tab left unpinned while another Space was shown returns to its Favorite, still unpinned",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedStorage("local", {
            "katip/spaces": [
              { id: "home", name: "Home", color: "grey" },
              { id: "work", name: "Work", color: "blue" },
            ],
            "katip/space-favorites": {
              home: [{ id: "mail", url: "https://mail.example/", title: "Mail" }],
            },
            "katip/restore-snapshot": [
              { url: "https://work.example/", spaceId: "work", pinned: null, titleOverride: null },
            ],
            "katip/favorite-restore-snapshot": [
              { url: "https://mail.example/inbox", favoriteId: "mail", isPinned: false },
            ],
          })
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [
              { url: "https://mail.example/inbox", title: "Inbox" },
              { url: "https://work.example/", title: "Work page", active: true },
            ],
          })
          yield* startBackground

          const view = yield* (yield* openSidebar(windowId)).viewWhere((v) =>
            Option.exists(spaceNamed(v, "Home"), (home) => home.favorites[0]?.openTab !== null),
          )

          expect({
            shown: Option.map(spaceNamed(view, "Work"), (work) => work.id === view.activeSpaceId),
            home: Option.map(spaceNamed(view, "Home"), (home) =>
              home.favorites.map((favorite) => favorite.openTab?.tabId),
            ),
            workTabs: temporaryTitlesIn(view, "Work"),
            mailPinned: yield* isPinned(Option.getOrThrow(Array.get(tabIds, 0))),
          }).toStrictEqual({
            shown: Option.some(true),
            home: Option.some([tabIds[0]]),
            workTabs: ["Work page"],
            mailPinned: false,
          })
        }),
      ),
  )
})

describe("the Favorites every Space shared before each had its own", () => {
  const sharedFavorites = [
    { id: "mail", url: "https://mail.example/", title: "Mail" },
    { id: "docs", url: "https://docs.example/", title: "Docs" },
  ]
  const twoSpaces = [
    { id: "home", name: "Home", color: "grey" },
    { id: "work", name: "Work", color: "blue" },
  ]

  const storedLocally = (key: string) => Storage.use((storage) => storage.local.get(key))

  it.live("are carried into every Space, and no longer kept as shared", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedStorage("local", {
          "katip/spaces": twoSpaces,
          "katip/favorites": sharedFavorites,
        })
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* startBackground

        const view = yield* (yield* openSidebar(windowId)).viewWhere((v) =>
          v.spaces.every((space) => space.favorites.length === 2),
        )

        expect([
          favoritesIn(view, "Home"),
          favoritesIn(view, "Work"),
          yield* storedLocally("katip/favorites"),
        ]).toStrictEqual([
          Option.some([
            ["Mail", "closed"],
            ["Docs", "closed"],
          ]),
          Option.some([
            ["Mail", "closed"],
            ["Docs", "closed"],
          ]),
          Option.none(),
        ])
      }),
    ),
  )

  it.live(
    "keep their open tabs, as Favorites of the Space shown, when Katip starts after the update",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedStorage("local", {
            "katip/spaces": twoSpaces,
            "katip/favorites": sharedFavorites,
            "katip/favorite-restore-snapshot": [
              { url: "https://mail.example/inbox/42", favoriteId: "mail" },
            ],
          })
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [{ url: "https://mail.example/inbox/42", title: "Inbox", pinned: true }, {}],
          })
          yield* startBackground

          const view = yield* (yield* openSidebar(windowId)).viewWhere(
            (v) => shownFavorites(v)[0]?.openTab !== null,
          )

          expect({
            shown: shownFavorites(view).map((favorite) => favorite.openTab?.tabId ?? null),
            other: Option.map(spaceNamed(view, "Work"), (work) =>
              work.favorites.map((favorite) => favorite.openTab),
            ),
          }).toStrictEqual({
            shown: [tabIds[0], null],
            other: Option.some([null, null]),
          })
        }),
      ),
  )

  it.live(
    "keep a tab the session still names as theirs, as the tab of the copy in the Space shown",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [{ url: "https://mail.example/inbox/42", title: "Inbox", pinned: true }, {}],
          })
          yield* fake.seedStorage("local", {
            "katip/spaces": twoSpaces,
            "katip/favorites": sharedFavorites,
          })
          yield* fake.seedStorage("session", {
            "katip/workspace": { tabs: [], windows: [{ windowId, activeSpaceId: "work" }] },
            "katip/favorite-tabs": [{ tabId: tabIds[0], favoriteId: "mail" }],
          })
          yield* startBackground

          const view = yield* (yield* openSidebar(windowId)).viewWhere(
            (v) => shownFavorites(v)[0]?.openTab !== null,
          )

          expect({
            shown: Option.map(spaceNamed(view, "Work"), (work) => work.id === view.activeSpaceId),
            work: shownFavorites(view).map((favorite) => favorite.openTab?.tabId ?? null),
          }).toStrictEqual({ shown: Option.some(true), work: [tabIds[0], null] })
        }),
      ),
  )

  it.live(
    "found again after each Space got its own, as after an interrupted start, aren't carried again, so a Space without any stays without",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedStorage("local", {
            "katip/spaces": twoSpaces,
            "katip/space-favorites": {
              home: [{ id: "home/mail", url: "https://mail.example/", title: "Mail" }],
            },
            "katip/favorites": sharedFavorites,
          })
          const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
          yield* startBackground

          const view = yield* (yield* openSidebar(windowId)).viewWhere((v) => v.spaces.length === 2)

          expect([
            favoritesIn(view, "Home"),
            favoritesIn(view, "Work"),
            yield* storedLocally("katip/favorites"),
          ]).toStrictEqual([Option.some([["Mail", "closed"]]), Option.some([]), Option.none()])
        }),
      ),
  )

  it.live("with no Space yet, are carried into the Space Katip makes at startup", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedStorage("local", { "katip/favorites": sharedFavorites })
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* startBackground

        const view = yield* (yield* openSidebar(windowId)).viewWhere(
          (v) => shownFavorites(v).length === 2,
        )

        expect([shownFavoritesOf(view), yield* storedLocally("katip/favorites")]).toStrictEqual([
          [
            ["Mail", "closed"],
            ["Docs", "closed"],
          ],
          Option.none(),
        ])
      }),
    ),
  )
})
