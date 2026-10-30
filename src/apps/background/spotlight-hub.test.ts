import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, Layer, Option, Queue, Ref, Schema, type Scope, Stream } from "effect"
import type { Action } from "#modules/actions"
import { SettingsRepository } from "#modules/settings"
import { SpaceName } from "#modules/space"
import { themeOf } from "#modules/theme"
import { BookmarkId, type PortSender, Tabs, type WindowId, Windows } from "#platform/browser"
import { fakeSearchUrl, FakeBrowser, makePortPair } from "#platform/browser-testing"
import { ClipboardRecorder } from "#platform/clipboard"
import { FakeHistory } from "#platform/history"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import { FakePermissions } from "#platform/permissions"
import {
  ClientMessage,
  RequestId,
  ServerMessage,
  type SidebarCommand,
  SIDEBAR_PORT_NAME,
  SPOTLIGHT_PORT_NAME,
  SpotlightClientMessage,
  type SpotlightMode,
  type SpotlightResult,
  SpotlightServerMessage,
} from "#protocol"
import { ExtensionInfo } from "./extension-info"
import { initialize } from "./initialize"
import { KatipState } from "./katip-state"
import { applicationLayer } from "./program"
import { runSidebarCommand } from "./sidebar-commands"
import { SidebarHub } from "./sidebar-hub"
import { runSpotlightChoice } from "./spotlight-choice"
import { SpotlightHub } from "./spotlight-hub"
import { openSpotlight } from "./spotlight-window"
import { backgroundTestLayer } from "./testing/background-harness"

const testLayerWith = (shortcuts: Layer.Layer<KeyboardShortcuts>) =>
  SpotlightHub.layer.pipe(
    Layer.provideMerge(applicationLayer),
    Layer.provideMerge(Layer.mergeAll(backgroundTestLayer, ExtensionInfo.layerTest, shortcuts)),
  )

type TestServices = Layer.Success<ReturnType<typeof testLayerWith>>

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, TestServices | Scope.Scope>,
  shortcuts: Layer.Layer<KeyboardShortcuts> = KeyboardShortcuts.layerTest({}),
) => effect.pipe(Effect.scoped, Effect.provide(testLayerWith(shortcuts)))

const spotlightPageSender: PortSender = {
  external: false,
  url: Option.none(),
  origin: Option.none(),
  tabId: Option.none(),
}

const encodeClientMessage = Schema.encodeEffect(SpotlightClientMessage)
const decodeServerMessage = Schema.decodeUnknownEffect(SpotlightServerMessage)

/** `callerWindowId` のウィンドウから開いた Spotlight として background に接続する。 */
const connectSpotlight = Effect.fnUntraced(function* (callerWindowId: WindowId) {
  const hub = yield* SpotlightHub
  const { client, server } = makePortPair(SPOTLIGHT_PORT_NAME, spotlightPageSender)
  yield* Effect.forkScoped(hub.serve(server, runSpotlightChoice))
  const inbox = yield* Queue.unbounded<SpotlightServerMessage>()
  yield* client.messages.pipe(
    Stream.mapEffect((raw) => decodeServerMessage(raw)),
    Stream.runForEach((message) => Queue.offer(inbox, message)),
    Effect.forkScoped,
  )
  const nextRequestId = yield* Ref.make(1)

  const ask = Effect.fnUntraced(function* (
    message: (requestId: RequestId) => SpotlightClientMessage,
  ) {
    const requestId = RequestId.make(yield* Ref.getAndUpdate(nextRequestId, (n) => n + 1))
    yield* client.post(yield* encodeClientMessage(message(requestId)))
    while (true) {
      const reply = yield* Queue.take(inbox)
      if (reply.requestId === requestId) return reply
    }
  })

  const search = (query: string, mode: SpotlightMode = "All") =>
    Effect.flatMap(
      ask((requestId) => ({
        _tag: "Search",
        requestId,
        windowId: callerWindowId,
        query,
        mode,
      })),
      (reply) =>
        reply._tag === "SearchResults" ? Effect.succeed(reply) : Effect.die("検索の応答ではない"),
    )

  const choose = (result: SpotlightResult) =>
    Effect.flatMap(
      ask((requestId) => ({ _tag: "Choose", requestId, windowId: callerWindowId, result })),
      (reply) =>
        reply._tag === "ChoiceSettled"
          ? Effect.succeed(reply.outcome)
          : Effect.die("決定の応答ではない"),
    )

  return { search, choose }
})

const ofTag =
  <Tag extends SpotlightResult["_tag"]>(tag: Tag) =>
  (results: ReadonlyArray<SpotlightResult>) =>
    results.filter(
      (result): result is Extract<SpotlightResult, { _tag: Tag }> => result._tag === tag,
    )

const openTabs = ofTag("OpenTab")
const pins = ofTag("Pin")
const spaces = ofTag("Space")
const bookmarks = ofTag("Bookmark")
const histories = ofTag("History")
const actions = ofTag("Action")

const actionsOfKind = (kind: Action["_tag"]) => (results: ReadonlyArray<SpotlightResult>) =>
  actions(results).filter((result) => result.action._tag === kind)

const encodeSidebarMessage = Schema.encodeEffect(ClientMessage)
const decodeSidebarMessage = Schema.decodeUnknownEffect(ServerMessage)

/** サイドパネルとして購読し、次に届く知らせを待つ Effect を返す。 */
const watchSidebarNotices = Effect.fnUntraced(function* (windowId: WindowId) {
  const hub = yield* SidebarHub
  const { client, server } = makePortPair(SIDEBAR_PORT_NAME, spotlightPageSender)
  yield* Effect.forkScoped(
    hub.serve(server, () => Effect.succeed({ _tag: "Succeeded", createdBookmarkId: null })),
  )
  const notices = yield* Queue.unbounded<string>()
  yield* client.messages.pipe(
    Stream.mapEffect((raw) => decodeSidebarMessage(raw)),
    Stream.runForEach((message) =>
      message._tag === "Notice" ? Queue.offer(notices, message.message) : Effect.void,
    ),
    Effect.forkScoped,
  )
  yield* client.post(yield* encodeSidebarMessage({ _tag: "Subscribe", windowId }))
  return Queue.take(notices)
})

const firstSpaceId = KatipState.use((state) =>
  Effect.flatMap(state.spaces.get, (all) =>
    Option.match(Array.head(all), {
      onNone: () => Effect.die("Space が無い"),
      onSome: (space) => Effect.succeed(space.id),
    }),
  ),
)

const run = (command: SidebarCommand) =>
  Effect.tap(runSidebarCommand(command), (outcome) =>
    outcome._tag === "Failed" ? Effect.die(outcome.reason) : Effect.void,
  )

const BOOKMARKS_BAR = BookmarkId.make("1")

describe("Spotlight の検索", () => {
  it.effect("検索語に一致する開いているタブを、所属する Space の名前を添えて返す", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({
          tabs: [
            { url: "https://docs.example/", title: "設計ドキュメント" },
            { url: "https://news.example/", title: "ニュース" },
          ],
        })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("設計")

        expect(openTabs(results).map(({ title, spaceName }) => [title, spaceName])).toStrictEqual([
          ["設計ドキュメント", "ホーム"],
        ])
      }),
    ),
  )

  it.effect("Favorites のタブは、どの Space にも属さないものとして返す", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({
          tabs: [{ url: "https://calendar.example/", title: "カレンダー", pinned: true }, {}],
        })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("カレンダー")

        expect(
          openTabs(results).map(({ isFavorite, spaceName }) => ({ isFavorite, spaceName })),
        ).toStrictEqual([{ isFavorite: true, spaceName: null }])
      }),
    ),
  )

  it.effect("別のウィンドウのタブも、別のウィンドウのものとして返す", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const caller = yield* fake.seedWindow({ tabs: [{ title: "手元" }] })
        yield* fake.seedWindow({ tabs: [{ url: "https://far.example/", title: "遠くのタブ" }] })
        yield* initialize
        const spotlight = yield* connectSpotlight(caller.windowId)

        const { results } = yield* spotlight.search("遠く")

        expect(openTabs(results).map(({ isInOtherWindow }) => isInOtherWindow)).toStrictEqual([
          true,
        ])
      }),
    ),
  )

  it.effect("Spotlight 自身のページは候補にしない", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* initialize
        yield* openSpotlight(windowId)
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("spotlight")

        expect(openTabs(results)).toStrictEqual([])
      }),
    ),
  )

  it.effect("閉じているピンを、Space とフォルダの名前を添えて返す", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/", title: "メール" }, {}],
        })
        yield* initialize
        const spaceId = yield* firstSpaceId
        const folder = yield* run({ _tag: "CreateFolder", spaceId, parentId: null })
        yield* run({
          _tag: "PlaceTabInPinned",
          tabId: tabIds[0],
          placement: {
            spaceId,
            parentId: folder._tag === "Succeeded" ? folder.createdBookmarkId : null,
            index: 0,
          },
        })
        yield* (yield* Tabs).remove([tabIds[0]])
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("メール")

        expect(
          pins(results).map(({ title, spaceName, folderPath }) => ({
            title,
            spaceName,
            folderPath,
          })),
        ).toStrictEqual([{ title: "メール", spaceName: "ホーム", folderPath: ["新しいフォルダ"] }])
      }),
    ),
  )

  it.effect("開いているピンはピンとしては返さず、ピンの名前のタブとして返す", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/", title: "Inbox (3)" }, {}],
        })
        yield* initialize
        yield* run({ _tag: "PinTab", tabId: tabIds[0] })
        yield* run({ _tag: "RenameTab", tabId: tabIds[0], title: "仕事のメール" })
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("仕事のメール")

        expect([openTabs(results).map(({ title }) => title), pins(results)]).toStrictEqual([
          ["仕事のメール"],
          [],
        ])
      }),
    ),
  )

  it.effect("Space を返し、呼び出し元のウィンドウで今の Space に印を付ける", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* initialize
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("仕事") })
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("")

        expect(spaces(results).map(({ name, isActive }) => [name, isActive])).toStrictEqual([
          ["ホーム", false],
          ["仕事", true],
        ])
      }),
    ),
  )

  it.effect(
    "Katip の外のブックマークも返し、ピンのブックマークはブックマークとしては返さない",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [{ url: "https://effect.website/blog", title: "Effect のブログ" }, {}],
          })
          yield* fake.seedBookmarks(BOOKMARKS_BAR, [
            { title: "Effect のドキュメント", url: "https://effect.website/docs" },
          ])
          yield* initialize
          yield* run({ _tag: "PinTab", tabId: tabIds[0] })
          const spotlight = yield* connectSpotlight(windowId)

          const { results } = yield* spotlight.search("effect")

          expect(bookmarks(results).map(({ title }) => title)).toStrictEqual([
            "Effect のドキュメント",
          ])
        }),
      ),
  )

  it.effect("ブックマークレットは返さない", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* fake.seedBookmarks(BOOKMARKS_BAR, [
          { title: "share this", url: "javascript:void(share())" },
        ])
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("share")

        expect(bookmarks(results)).toStrictEqual([])
      }),
    ),
  )

  it.effect("ブックマークを検索できなくても、タブは返す", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({
          tabs: [{ url: "https://docs.example/", title: "設計ドキュメント" }, {}],
        })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)
        yield* fake.failNext("bookmarks.search")

        const { results } = yield* spotlight.search("設計")

        expect(openTabs(results).map(({ title }) => title)).toStrictEqual(["設計ドキュメント"])
      }),
    ),
  )

  it.effect("最後に、入力でウェブを検索する項目を返す", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("katip")

        expect(results.at(-1)).toStrictEqual({ _tag: "SearchWeb", query: "katip" })
      }),
    ),
  )

  it.effect("呼び出し元のウィンドウで今の Space のテーマを添える", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* initialize
        const theme = themeOf([{ hue: 200, chroma: 0.5 }])
        yield* run({ _tag: "SetSpaceTheme", spaceId: yield* firstSpaceId, theme })
        const spotlight = yield* connectSpotlight(windowId)

        const { spaceTheme } = yield* spotlight.search("")

        expect(spaceTheme).toStrictEqual(theme)
      }),
    ),
  )
})

describe("Spotlight で候補を選んだとき", () => {
  it.effect("開いているタブを選ぶと、そのタブがアクティブになり、そのウィンドウが前面に出る", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const caller = yield* fake.seedWindow({ tabs: [{}], focused: true })
        const other = yield* fake.seedWindow({
          tabs: [{}, { url: "https://far.example/", title: "遠くのタブ" }],
        })
        yield* initialize
        const spotlight = yield* connectSpotlight(caller.windowId)
        const [found] = openTabs((yield* spotlight.search("遠く")).results)

        const outcome = yield* spotlight.choose(found ?? (yield* Effect.die("候補が無い")))

        const tab = yield* (yield* Tabs).get(other.tabIds[1])
        const focused = yield* (yield* Windows).getLastFocused
        expect([outcome, tab.active, focused.id]).toStrictEqual([
          { _tag: "Succeeded" },
          true,
          other.windowId,
        ])
      }),
    ),
  )

  it.effect("閉じているピンを選ぶと、呼び出し元のウィンドウにピンのタブを開く", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/", title: "メール" }, {}],
        })
        yield* initialize
        yield* run({ _tag: "PinTab", tabId: tabIds[0] })
        yield* (yield* Tabs).remove([tabIds[0]])
        const spotlight = yield* connectSpotlight(windowId)
        const [pin] = pins((yield* spotlight.search("メール")).results)

        yield* spotlight.choose(pin ?? (yield* Effect.die("候補が無い")))

        const { results } = yield* spotlight.search("メール")
        expect(openTabs(results).map(({ url, spaceName }) => [url, spaceName])).toStrictEqual([
          ["https://mail.example/", "ホーム"],
        ])
      }),
    ),
  )

  it.effect("Space を選ぶと、呼び出し元のウィンドウがその Space に切り替わる", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* initialize
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("仕事") })
        const spotlight = yield* connectSpotlight(windowId)
        const [home] = spaces((yield* spotlight.search("ホーム")).results)

        yield* spotlight.choose(home ?? (yield* Effect.die("候補が無い")))

        const { results } = yield* spotlight.search("")
        expect(
          spaces(results).flatMap(({ name, isActive }) => (isActive ? [name] : [])),
        ).toStrictEqual(["ホーム"])
      }),
    ),
  )

  it.effect("ブックマークを選ぶと、呼び出し元のウィンドウの今の Space に新しいタブで開く", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* fake.seedBookmarks(BOOKMARKS_BAR, [
          { title: "Effect のドキュメント", url: "https://effect.website/docs" },
        ])
        yield* initialize
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("仕事") })
        const spotlight = yield* connectSpotlight(windowId)
        const [bookmark] = bookmarks((yield* spotlight.search("effect")).results)

        yield* spotlight.choose(bookmark ?? (yield* Effect.die("候補が無い")))

        const { results } = yield* spotlight.search("effect.website")
        expect(
          openTabs(results).map(({ url, spaceName, isInOtherWindow }) => ({
            url,
            spaceName,
            isInOtherWindow,
          })),
        ).toStrictEqual([
          { url: "https://effect.website/docs", spaceName: "仕事", isInOtherWindow: false },
        ])
      }),
    ),
  )

  it.effect(
    "URL を開く項目を選ぶと、呼び出し元のウィンドウでその URL をアクティブなタブとして開く",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
          yield* initialize
          const spotlight = yield* connectSpotlight(windowId)

          yield* spotlight.choose({ _tag: "OpenUrl", url: "https://example.com/" })

          const [active] = yield* (yield* Tabs).query({ windowId, active: true })
          expect(active?.url).toStrictEqual(Option.some("https://example.com/"))
        }),
      ),
  )

  it.effect("ウェブで検索する項目を選ぶと、呼び出し元のウィンドウの新しいタブで検索する", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        yield* spotlight.choose({ _tag: "SearchWeb", query: "effect ts" })

        const windowTabs = yield* (yield* Tabs).query({ windowId })
        expect(windowTabs.map(({ url, active }) => [url, active])).toStrictEqual([
          [Option.some("chrome://newtab/"), false],
          [Option.some(fakeSearchUrl("effect ts")), true],
        ])
      }),
    ),
  )

  it.effect("ページを開いたら、Spotlight から呼び出し元のウィンドウへフォーカスを戻す", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* initialize
        yield* openSpotlight(windowId)
        const spotlight = yield* connectSpotlight(windowId)

        yield* spotlight.choose({ _tag: "OpenUrl", url: "https://example.com/" })

        expect((yield* (yield* Windows).getLastFocused).id).toBe(windowId)
      }),
    ),
  )

  it.effect("選んだタブが既に閉じていれば、開けなかったことを返す", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{}, { url: "https://gone.example/", title: "閉じるタブ" }],
        })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)
        const [found] = openTabs((yield* spotlight.search("閉じる")).results)
        yield* (yield* Tabs).remove([tabIds[1]])

        const outcome = yield* spotlight.choose(found ?? (yield* Effect.die("候補が無い")))

        expect(outcome._tag).toBe("Failed")
      }),
    ),
  )
})

const firstOf = <A>(found: ReadonlyArray<A>) =>
  Option.match(Array.head(found), {
    onNone: () => Effect.die("候補が無い"),
    onSome: Effect.succeed,
  })

describe("Spotlight の操作の候補", () => {
  it.effect("操作だけを探すと、入力が空でも使える操作が決まった順に並ぶ", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("", "Actions")

        expect(
          results.map((result) => (result._tag === "Action" ? result.title : result._tag)),
        ).toStrictEqual([
          "URL をコピー",
          "URL を Markdown のリンクとしてコピー",
          "タブをピン留め",
          "タブを複製",
          "タブを閉じる",
          "タブをミュート",
          "一時タブをすべて閉じる",
          "設定を開く",
        ])
      }),
    ),
  )

  it.effect("タブを別の Space へ移す操作は、タブが今いる Space 以外の Space の分だけ出る", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://a.example/" }],
        })
        yield* initialize
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("仕事") })
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("趣味") })
        yield* (yield* Tabs).update(tabIds[0], { active: true })
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("", "Actions")

        expect(actionsOfKind("MoveTabToSpace")(results).map(({ title }) => title)).toStrictEqual([
          "タブを「仕事」へ移動",
          "タブを「趣味」へ移動",
        ])
      }),
    ),
  )

  it.effect("ミュートしているタブでは、ミュートを解除する操作になる", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({
          tabs: [{ url: "https://music.example/", muted: true }],
        })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("", "Actions")

        expect(actionsOfKind("ToggleMute")(results).map(({ title }) => title)).toStrictEqual([
          "タブのミュートを解除",
        ])
      }),
    ),
  )

  it.effect("ふつうの検索でも、表示の言語とは別の英語の名前で操作が見つかる", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("duplicate")

        expect(actions(results).map(({ title }) => title)).toStrictEqual(["タブを複製"])
      }),
    ),
  )

  it.effect("ふつうの検索で入力が空なら、操作は出さない", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }, {}] })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("")

        expect(actions(results)).toStrictEqual([])
      }),
    ),
  )

  it.effect("Chrome でキーを割り当てた操作には、そのキーを添える", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("", "Actions")

        expect(
          actions(results)
            .slice(0, 4)
            .map(({ action, shortcut }) => [action._tag, shortcut]),
        ).toStrictEqual([
          ["CopyUrl", "⇧⌘C"],
          ["CopyMarkdownLink", null],
          ["TogglePin", "⌥D"],
          ["DuplicateTab", null],
        ])
      }),
      KeyboardShortcuts.layerTest({
        assigned: { "copy-current-url": "⇧⌘C", "quick-pin-toggle": "⌥D" },
        isMac: true,
      }),
    ),
  )

  it.effect("ページ上のショートカットを有効にした操作には、そのショートカットのキーを添える", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* initialize
        yield* (yield* SettingsRepository).update({ pageShortcuts: { copyMarkdownLink: true } })
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("", "Actions")

        expect(
          actionsOfKind("CopyMarkdownLink")(results).map(({ shortcut }) => shortcut),
        ).toStrictEqual(["⌥⇧⌘C"])
      }),
      KeyboardShortcuts.layerTest({
        assigned: { "copy-current-url-as-markdown": "⇧⌘M" },
        isMac: true,
      }),
    ),
  )
})

describe("Spotlight で操作を選んだとき", () => {
  const seedPage = Effect.gen(function* () {
    const fake = yield* FakeBrowser
    const seeded = yield* fake.seedWindow({
      tabs: [{ url: "https://docs.example/guide", title: "使い方 [下書き]", active: true }],
    })
    yield* initialize
    return seeded
  })

  it.effect("URL のコピーを選ぶと、アクティブなタブの URL が入り、サイドパネルに知らせが出る", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId } = yield* seedPage
        const nextNotice = yield* watchSidebarNotices(windowId)
        const spotlight = yield* connectSpotlight(windowId)
        const copyUrl = yield* firstOf(
          actionsOfKind("CopyUrl")((yield* spotlight.search("", "Actions")).results),
        )

        const outcome = yield* spotlight.choose(copyUrl)

        expect({
          outcome,
          written: yield* (yield* ClipboardRecorder).written,
          notice: yield* nextNotice,
        }).toStrictEqual({
          outcome: { _tag: "Succeeded" },
          written: ["https://docs.example/guide"],
          notice: "URL をコピーしました",
        })
      }),
    ),
  )

  it.effect("Markdown のリンクとしてコピーを選ぶと、[タイトル](URL) の形で入る", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId } = yield* seedPage
        const spotlight = yield* connectSpotlight(windowId)
        const copyLink = yield* firstOf(
          actionsOfKind("CopyMarkdownLink")((yield* spotlight.search("", "Actions")).results),
        )

        yield* spotlight.choose(copyLink)

        expect(yield* (yield* ClipboardRecorder).written).toStrictEqual([
          "[使い方 \\[下書き\\]](https://docs.example/guide)",
        ])
      }),
    ),
  )

  it.effect("ミュートを選ぶと、アクティブなタブがミュートされる", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabIds } = yield* seedPage
        const spotlight = yield* connectSpotlight(windowId)
        const mute = yield* firstOf(
          actionsOfKind("ToggleMute")((yield* spotlight.search("", "Actions")).results),
        )

        yield* spotlight.choose(mute)

        expect((yield* (yield* Tabs).get(tabIds[0])).muted).toBe(true)
      }),
    ),
  )

  it.effect("複製を選ぶと、同じページのタブが増える", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId } = yield* seedPage
        const spotlight = yield* connectSpotlight(windowId)
        const duplicate = yield* firstOf(
          actionsOfKind("DuplicateTab")((yield* spotlight.search("", "Actions")).results),
        )

        yield* spotlight.choose(duplicate)

        const urls = (yield* (yield* Tabs).query({ windowId })).map((tab) => tab.url)
        expect(urls).toStrictEqual([
          Option.some("https://docs.example/guide"),
          Option.some("https://docs.example/guide"),
        ])
      }),
    ),
  )

  it.effect("別の Space へ移す操作を選ぶと、アクティブなタブがその Space に移る", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabIds } = yield* seedPage
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("仕事") })
        yield* (yield* Tabs).update(tabIds[0], { active: true })
        const spotlight = yield* connectSpotlight(windowId)
        const move = yield* firstOf(
          actionsOfKind("MoveTabToSpace")((yield* spotlight.search("", "Actions")).results),
        )

        yield* spotlight.choose(move)

        const moved = openTabs((yield* spotlight.search("使い方")).results)
        expect([move.title, moved.map(({ spaceName }) => spaceName)]).toStrictEqual([
          "タブを「仕事」へ移動",
          ["仕事"],
        ])
      }),
    ),
  )
})

describe("Spotlight の履歴の候補", () => {
  const seedHistory = Effect.gen(function* () {
    const fake = yield* FakeBrowser
    const { windowId } = yield* fake.seedWindow({
      tabs: [{ url: "https://katip.example/open", title: "Katip 開いているページ" }],
    })
    yield* (yield* FakeHistory).seed([
      { url: "https://katip.example/open", title: "Katip 開いているページ", lastVisitedAt: 300 },
      { url: "https://katip.example/docs", title: "Katip のドキュメント", lastVisitedAt: 200 },
    ])
    yield* initialize
    return windowId
  })

  it.effect("履歴の許可があれば、入力に一致する閲覧履歴のページも候補に出る", () =>
    inBackground(
      Effect.gen(function* () {
        const windowId = yield* seedHistory
        yield* (yield* FakePermissions).grantPermissions(["history"])
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("katip")

        expect(histories(results)).toStrictEqual([
          {
            _tag: "History",
            title: "Katip のドキュメント",
            url: "https://katip.example/docs",
            lastVisitedAt: 200,
          },
        ])
      }),
    ),
  )

  it.effect("開いているタブと同じ URL の履歴は出さない", () =>
    inBackground(
      Effect.gen(function* () {
        const windowId = yield* seedHistory
        yield* (yield* FakePermissions).grantPermissions(["history"])
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("開いている")

        expect([openTabs(results).length, histories(results)]).toStrictEqual([1, []])
      }),
    ),
  )

  it.effect("履歴の許可が無ければ、閲覧履歴を読まない", () =>
    inBackground(
      Effect.gen(function* () {
        const windowId = yield* seedHistory
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("katip")

        expect([histories(results), yield* (yield* FakeHistory).searches]).toStrictEqual([[], []])
      }),
    ),
  )

  it.effect("入力が空なら、閲覧履歴を読まない", () =>
    inBackground(
      Effect.gen(function* () {
        const windowId = yield* seedHistory
        yield* (yield* FakePermissions).grantPermissions(["history"])
        const spotlight = yield* connectSpotlight(windowId)

        yield* spotlight.search("")

        expect(yield* (yield* FakeHistory).searches).toStrictEqual([])
      }),
    ),
  )

  it.effect("履歴のページを選ぶと、呼び出し元のウィンドウの今の Space に開く", () =>
    inBackground(
      Effect.gen(function* () {
        const windowId = yield* seedHistory
        yield* (yield* FakePermissions).grantPermissions(["history"])
        const spotlight = yield* connectSpotlight(windowId)
        const page = yield* firstOf(histories((yield* spotlight.search("ドキュメント")).results))

        yield* spotlight.choose(page)

        const opened = openTabs((yield* spotlight.search("katip.example/docs")).results)
        expect(opened.map(({ url, spaceName }) => [url, spaceName])).toStrictEqual([
          ["https://katip.example/docs", "ホーム"],
        ])
      }),
    ),
  )
})
