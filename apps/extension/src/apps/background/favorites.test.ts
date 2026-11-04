import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, Layer, Option, Order, type Scope } from "effect"
import type { FavoriteId } from "#modules/favorites"
import { Tabs, type BrowserTab, type TabId, type WindowId } from "#platform/browser"
import { FakeBrowser, type TabSeed } from "#platform/browser-testing"
import type { SidebarView } from "#protocol"
import {
  backgroundTestLayer,
  openSidebar,
  spaceNamed,
  startBackground,
} from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const favoritesOf = (view: SidebarView) =>
  view.favorites.map((favorite) => [favorite.title, favorite.openTab === null ? "closed" : "open"])

const favoriteIdOf = (view: SidebarView, title: string): FavoriteId =>
  Option.getOrThrow(
    Option.flatMap(
      Array.findFirst(view.favorites, (favorite) => favorite.title === title),
      (favorite) => Option.fromNullishOr(favorite.favoriteId),
    ),
  )

const byIndex = Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index)

const pinnedUrlsIn = (windowId: WindowId) =>
  Effect.map(
    Tabs.use((tabs) => tabs.query({ windowId, pinned: true })),
    (tabs) => Array.sort(tabs, byIndex).map((tab) => Option.getOrNull(tab.url)),
  )

const temporaryTitlesInHome = (view: SidebarView) =>
  Option.match(spaceNamed(view, "Home"), {
    onNone: (): ReadonlyArray<string> => [],
    onSome: (space) =>
      space.temporaryEntries.flatMap((entry) =>
        entry._tag === "TemporaryTab" ? [entry.tab.title] : entry.tabs.map((tab) => tab.title),
      ),
  })

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
    const view = yield* sidebar.viewWhere((v) => v.favorites.length === pinned.length)
    const tabAt = (index: number): TabId => Option.getOrThrow(Array.get(window.tabIds, index))
    return { windowId: window.windowId, tabAt, sidebar, view }
  })

describe("Favorites", () => {
  it.live("closing a Favorite's tab keeps the Favorite, closed", () =>
    inBackground(
      Effect.gen(function* () {
        const { tabAt, sidebar } = yield* startWithFavorites("Mail", "Docs")

        yield* Tabs.use((tabs) => tabs.remove([tabAt(0)]))
        const view = yield* sidebar.viewWhere((v) => v.favorites[0]?.openTab === null)

        expect([favoritesOf(view), temporaryTitlesInHome(view)]).toStrictEqual([
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
        const closed = yield* sidebar.viewWhere((v) => v.favorites[1]?.openTab === null)

        yield* sidebar.run({
          _tag: "OpenFavorite",
          windowId,
          favoriteId: favoriteIdOf(closed, "b"),
        })
        const view = yield* sidebar.viewWhere((v) => v.favorites[1]?.openTab?.isActive === true)

        expect([favoritesOf(view), yield* pinnedUrlsIn(windowId)]).toStrictEqual([
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
    "tabs pinned before Katip starts become Favorites, keeping each window's order, the same page in two windows once",
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
            (v) => v.favorites.length === 3,
          )
          const secondView = yield* (yield* openSidebar(second.windowId)).viewWhere(
            (v) => v.favorites.length === 3,
          )

          expect([favoritesOf(firstView), favoritesOf(secondView)]).toStrictEqual([
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
            "katip/favorites": [{ id: "mail", url: "https://mail.example/", title: "Mail" }],
            "katip/favorite-restore-snapshot": [
              { url: "https://mail.example/inbox/42", favoriteId: "mail" },
            ],
          })
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [{ url: "https://mail.example/inbox/42", title: "Inbox", pinned: true }, {}],
          })
          yield* startBackground

          const view = yield* (yield* openSidebar(windowId)).viewWhere(
            (v) => v.favorites[0]?.openTab !== null,
          )

          expect(
            view.favorites.map((favorite) => [favorite.favoriteId, favorite.openTab?.tabId]),
          ).toStrictEqual([["mail", tabIds[0]]])
        }),
      ),
  )

  it.live("adding a tab to Favorites at a place pins it at the matching place", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabAt, sidebar } = yield* startWithFavorites("a", "b")

        yield* sidebar.run({ _tag: "AddToFavorites", tabId: tabAt(2), index: 1 })
        const view = yield* sidebar.viewWhere((v) => v.favorites.length === 3)

        expect([favoritesOf(view), yield* pinnedUrlsIn(windowId)]).toStrictEqual([
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
        const view = yield* sidebar.viewWhere((v) => v.favorites[2]?.title === "a")

        expect([
          favoritesOf(view).map(([title]) => title),
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
        const view = yield* sidebar.viewWhere((v) => v.favorites[0]?.title === "c")

        expect(favoritesOf(view).map(([title]) => title)).toStrictEqual(["c", "a", "b"])
      }),
    ),
  )

  it.live("removing a Favorite keeps its tab open as a temporary tab of the Space shown", () =>
    inBackground(
      Effect.gen(function* () {
        const { sidebar, view: before } = yield* startWithFavorites("Mail")

        yield* sidebar.run({ _tag: "RemoveFavorite", favoriteId: favoriteIdOf(before, "Mail") })
        const view = yield* sidebar.viewWhere((v) => temporaryTitlesInHome(v).includes("Mail"))

        expect(view.favorites).toStrictEqual([])
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

        expect(view.favorites).toStrictEqual([])
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

        expect(favoritesOf(view)).toStrictEqual([["Mail", "closed"]])
      }),
    ),
  )
})
