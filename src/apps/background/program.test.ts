import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, type Layer, Option, type Scope } from "effect"
import { FakeBrowser } from "#platform/browser-testing"
import { themeOf } from "#modules/theme"
import { ClipboardRecorder } from "#platform/clipboard"
import { Bookmarks, Tabs, TabId } from "#platform/browser"
import type { PinnedItemView, SidebarView } from "#protocol"
import {
  backgroundTestLayer,
  eventually,
  openSidebar,
  spaceNamed,
  startBackground,
} from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const temporaryTitles = (view: SidebarView, spaceName: string) =>
  Option.map(spaceNamed(view, spaceName), (space) => space.temporaryTabs.map((tab) => tab.title))

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

describe("起動", () => {
  it.live("Space が無ければ「ホーム」を作り、開いているタブをそこに入れる", () =>
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
          Option.exists(temporaryTitles(v, "ホーム"), (titles) => titles.length === 2),
        )

        expect(view.spaces.map((space) => space.name)).toStrictEqual(["ホーム"])
      }),
    ),
  )

  it.live("ブラウザの再起動後は、記録した URL と一致するタブが元の Space に戻る", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedStorage("local", {
          "katip/spaces": [
            { id: "home", name: "ホーム", color: "grey" },
            { id: "work", name: "仕事", color: "blue" },
          ],
          "katip/restore-snapshot": [
            { url: "https://work.example/", spaceId: "work", pinned: null, titleOverride: null },
          ],
        })
        const { windowId } = yield* fake.seedWindow({
          tabs: [
            { url: "https://home.example/", title: "家" },
            { url: "https://work.example/", title: "職場" },
          ],
        })

        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const view = yield* sidebar.viewWhere((v) =>
          Option.exists(temporaryTitles(v, "仕事"), (titles) => titles.length === 1),
        )

        expect([temporaryTitles(view, "ホーム"), temporaryTitles(view, "仕事")]).toStrictEqual([
          Option.some(["家"]),
          Option.some(["職場"]),
        ])
      }),
    ),
  )
})

describe("Space の操作", () => {
  it.live("新しい Space を作るとその Space に切り替わり、新しいタブがその Space に開く", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)

        const outcome = yield* sidebar.run({ _tag: "CreateSpace", windowId })
        const view = yield* sidebar.viewWhere((v) =>
          Option.exists(spaceNamed(v, "スペース 2"), (space) => space.temporaryTabs.length === 1),
        )

        expect([outcome._tag, activeSpaceName(view)]).toStrictEqual([
          "Succeeded",
          Option.some("スペース 2"),
        ])
      }),
    ),
  )

  it.live("Space を削除しても、その Space の一時タブは閉じずに残る Space へ移る", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.run({ _tag: "CreateSpace", windowId })
        const created = yield* sidebar.viewWhere((v) => v.spaces.length === 2)
        const doomed = Option.getOrThrow(spaceNamed(created, "スペース 2"))

        yield* sidebar.run({ _tag: "DeleteSpace", spaceId: doomed.id })
        const view = yield* sidebar.viewWhere((v) => v.spaces.length === 1)

        expect(Option.map(spaceNamed(view, "ホーム"), (s) => s.temporaryTabs.length)).toStrictEqual(
          Option.some(2),
        )
      }),
    ),
  )

  it.live("テーマを変えるとビューに反映され、同期中のタブグループもテーマに近い色になる", () =>
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

  it.live("最後の Space は削除できない", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const view = yield* sidebar.viewWhere((v) => v.spaces.length === 1)

        const outcome = yield* sidebar.run({ _tag: "DeleteSpace", spaceId: view.activeSpaceId })

        expect(outcome).toStrictEqual({ _tag: "Failed", reason: "最後の Space は削除できません" })
      }),
    ),
  )
})

describe("タブ", () => {
  it.live("アクティブな Space で開いたタブは、その Space の一時タブになる", () =>
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
          Option.exists(spaceNamed(v, "スペース 2"), (space) => space.temporaryTabs.length === 2),
        )

        expect(
          Option.map(spaceNamed(view, "スペース 2"), (s) => s.temporaryTabs.map((t) => t.url)),
        ).toStrictEqual(Option.some(["https://new.example/", "chrome://newtab/"]))
      }),
    ),
  )

  it.live("ピン留めしたタブを閉じても、閉じたピンとして残る", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/", title: "メール" }, { url: "https://b.example/" }],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)

        yield* sidebar.run({ _tag: "PinTab", tabId: tabIds[0] })
        yield* sidebar.viewWhere((v) => pinnedItems(v, "ホーム").some((p) => p.openTab !== null))
        yield* sidebar.run({ _tag: "CloseTab", tabId: tabIds[0] })
        const view = yield* sidebar.viewWhere((v) =>
          pinnedItems(v, "ホーム").some((p) => p.openTab === null),
        )

        expect(pinnedItems(view, "ホーム").map((p) => [p.title, p.url, p.openTab])).toStrictEqual([
          ["メール", "https://mail.example/", null],
        ])
      }),
    ),
  )

  it.live("閉じたピンを開くと、そのピンに結びついたタブとして開く", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/", title: "メール" }, { url: "https://b.example/" }],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)
        yield* sidebar.run({ _tag: "PinTab", tabId: tabIds[0] })
        yield* sidebar.run({ _tag: "CloseTab", tabId: tabIds[0] })
        const closed = yield* sidebar.viewWhere((v) =>
          pinnedItems(v, "ホーム").some((p) => p.openTab === null),
        )
        const pin = Option.getOrThrow(Array.head(pinnedItems(closed, "ホーム")))

        yield* sidebar.run({ _tag: "OpenPinnedItem", windowId, bookmarkId: pin.bookmarkId })
        const view = yield* sidebar.viewWhere((v) =>
          pinnedItems(v, "ホーム").some((p) => p.openTab !== null),
        )

        expect({
          temporary: temporaryTitles(view, "ホーム").pipe(Option.map((titles) => titles.length)),
          openedUrl: pinnedItems(view, "ホーム")[0]?.openTab?.tab.url,
        }).toStrictEqual({ temporary: Option.some(1), openedUrl: "https://mail.example/" })
      }),
    ),
  )

  it.live("ショートカットでピン留めを切り替えると、ブックマークが作られて消える", () =>
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

describe("URL のコピー", () => {
  it.live("ショートカットでアクティブなタブの URL がコピーされ、サイドパネルに知らされる", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://copy.example/page?q=1", active: true }],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)

        yield* fake.emit({
          _tag: "CommandTriggered",
          command: "copy-current-url",
          tab: Option.some(yield* (yield* Tabs).get(tabIds[0])),
        })
        const notice = yield* sidebar.noticeWhere(() => true)

        expect([yield* (yield* ClipboardRecorder).written, notice]).toStrictEqual([
          ["https://copy.example/page?q=1"],
          "URL をコピーしました",
        ])
      }),
    ),
  )
})

describe("自動アーカイブ", () => {
  it.live("閾値より長く使われていない一時タブは、アーカイブされて閉じる", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [
            { url: "https://active.example/", active: true },
            { url: "https://stale.example/", title: "古いタブ" },
          ],
        })
        yield* fake.seedStorage("sync", {
          "katip/settings": { autoArchive: { enabled: true, idleMinutes: 1 } },
        })
        yield* fake.seedStorage("local", {
          "katip/spaces": [{ id: "home", name: "ホーム", color: "grey" }],
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

        yield* fake.fireAlarm("katip/auto-archive")
        const view = yield* sidebar.viewWhere((v) => v.archive.length === 1)

        expect({
          archived: view.archive.map((entry) => entry.title),
          open: temporaryTitles(view, "ホーム").pipe(Option.map((titles) => titles.length)),
          closedTabStillExists: (yield* fake.snapshot).tabs.some(
            (tab) => tab.id === TabId.make(tabIds[1]),
          ),
        }).toStrictEqual({
          archived: ["古いタブ"],
          open: Option.some(1),
          closedTabStillExists: false,
        })
      }),
    ),
  )
})
