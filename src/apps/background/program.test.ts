import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, Layer, Option, type Scope } from "effect"
import { FakeBrowser } from "#platform/browser-testing"
import { themeOf } from "#modules/theme"
import { ClipboardRecorder } from "#platform/clipboard"
import { OperationTimeLimit } from "./program"
import { Bookmarks, Storage, Tabs, TabId } from "#platform/browser"
import type { PinnedItemView, SidebarView, SpaceView } from "#protocol"
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

describe("ブラウザの終了と再起動", () => {
  it.live(
    "フォルダにピン留めしたタブは、終了して開き直しても同じピンとして開いている",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const storage = yield* Storage
          const first = yield* fake.seedWindow({
            tabs: [
              { url: "https://mail.example/", title: "メール" },
              { url: "https://other.example/", title: "その他" },
            ],
          })
          // 1 回目のセッションの background は、スコープを閉じて確実に止める
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
              // 再起動用の記録の保存は遅延して行われるので、保存されるまで待つ
              yield* Effect.sleep("1500 millis")

              yield* fake.closeWindow(first.windowId)
              yield* Effect.sleep("1500 millis")
            }),
          )
          yield* storage.session.remove("katip/workspace")
          yield* storage.session.remove("katip/restore-queue")
          const restored = yield* fake.seedWindow({
            tabs: [
              { url: "https://mail.example/", title: "メール" },
              { url: "https://other.example/", title: "その他" },
            ],
          })
          yield* startBackground
          // fake は 1 回目の起動と同じ接続口を使い回すので、2 回目の background が接続の購読を
          // 始める前に繋ぐと、その接続は誰にも届かない。実機では起動のたびに接続口が作られ、
          // 購読まで溜められるため起きない
          yield* Effect.sleep("300 millis")
          const reopened = yield* openSidebar(restored.windowId)
          const view = yield* reopened.viewWhere((v) =>
            Option.exists(spaceNamed(v, "ホーム"), (space) => space.pinned._tag === "Available"),
          )
          const folderView = Option.getOrThrow(spaceNamed(view, "ホーム")).pinned
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
          ).toStrictEqual([["メール", restored.tabIds[0]]])
        }),
      ),
    20_000,
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
          Option.exists(
            spaceNamed(v, "スペース 2"),
            (space) => temporaryTabsIn(space).length === 1,
          ),
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

        expect(
          Option.map(spaceNamed(view, "ホーム"), (s) => temporaryTabsIn(s).length),
        ).toStrictEqual(Option.some(2))
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
          Option.exists(
            spaceNamed(v, "スペース 2"),
            (space) => temporaryTabsIn(space).length === 2,
          ),
        )

        expect(
          Option.map(spaceNamed(view, "スペース 2"), (s) => temporaryTabsIn(s).map((t) => t.url)),
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

describe("分割ビュー", () => {
  const entriesShape = (view: SidebarView) =>
    Option.match(spaceNamed(view, "ホーム"), {
      onNone: () => [],
      onSome: (space) =>
        space.temporaryEntries.map((entry) =>
          entry._tag === "TemporaryTab" ? entry.tab.title : entry.tabs.map((tab) => tab.title),
        ),
    })

  const pinnedSplits = (view: SidebarView) =>
    Option.match(spaceNamed(view, "ホーム"), {
      onNone: () => [],
      onSome: (space) =>
        space.pinned._tag === "Available"
          ? space.pinned.nodes.filter((node) => node._tag === "PinnedSplit")
          : [],
    })

  const splitIdIn = (view: SidebarView) =>
    Option.getOrThrow(
      Array.findFirst(Option.getOrThrow(spaceNamed(view, "ホーム")).temporaryEntries, (entry) =>
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

  it.live("タブを別のタブに重ねると分割ビューになり、左右の順を保ったまま 1 行にまとまる", () =>
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

        // 既定では新しいタブを上に表示するので、行の並びは Chrome の並びの逆になる
        expect([outcome._tag, entriesShape(view)]).toStrictEqual(["Succeeded", ["B", ["A", "C"]]])
      }),
    ),
  )

  it.live("分割を解除すると、2 つの単独の行に戻る", () =>
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

  it.live("分割をピン留めすると分割ピンになり、タブを閉じても分割ピンとして残る", () =>
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

  it.live("閉じた分割ピンを開くと、2 つのタブが分割ビューで並んで開く", () =>
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

describe("Chrome の API が応答しないとき", () => {
  it.live("時間を超えた操作は打ち切られ、その後の操作は処理される", () =>
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
          { _tag: "Failed", reason: "時間内に完了しませんでした" },
          "Succeeded",
        ])
      }),
    ),
  )
})

describe("分割ビューの API が無い Chrome", () => {
  it.live("分割はできないと示され、分割しようとしても理由つきで断られる", () =>
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
        { _tag: "Failed", reason: "この Chrome では分割ビューを使えません" },
      ])
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(
          FakeBrowser.layerWith({ supportsSplitView: false }),
          ClipboardRecorder.layer,
        ),
      ),
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
