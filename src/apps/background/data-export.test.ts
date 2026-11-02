import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, type Layer, Option, Result, Schema, type Scope, Stream } from "effect"
import { decodeExportFile } from "#modules/export"
import { SpaceName } from "#modules/space"
import { themeOf } from "#modules/theme"
import { BrowserEvents, type PortSender } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import {
  type CommandOutcome,
  EXPORT_PORT_NAME,
  ExportClientMessage,
  ExportServerMessage,
  type SidebarView,
} from "#protocol"
import { serveDataExport } from "./data-export"
import {
  backgroundTestLayer,
  openSidebar,
  spaceNamed,
  startBackground,
} from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const exportRequest = Schema.encodeSync(ExportClientMessage)({ _tag: "Export" })
const decodeServerMessage = Schema.decodeUnknownEffect(ExportServerMessage)

/** 設定画面として接続し、書き出しを求めて、最初の返事を受け取る。 */
const requestExport = (sender?: PortSender) =>
  Effect.gen(function* () {
    const port = yield* (yield* FakeBrowser).connect(EXPORT_PORT_NAME, sender)
    yield* port.post(exportRequest)
    const reply = yield* port.messages.pipe(Stream.runHead, Effect.timeout("5 seconds"))
    return yield* Option.match(reply, {
      onNone: () => Effect.die(new Error("返事が届く前に切断された")),
      onSome: decodeServerMessage,
    })
  })

const exportedContent = Effect.gen(function* () {
  const reply = yield* requestExport()
  return reply._tag === "Exported"
    ? reply.content
    : yield* Effect.die(new Error("書き出せなかった"))
})

const createdIdOf = (outcome: CommandOutcome) =>
  outcome._tag === "Succeeded" && outcome.createdBookmarkId !== null
    ? Effect.succeed(outcome.createdBookmarkId)
    : Effect.die(new Error("ピンを作れなかった"))

const splitViewIdIn = (view: SidebarView) =>
  Array.findFirst(Option.getOrThrow(spaceNamed(view, "ホーム")).temporaryEntries, (entry) =>
    entry._tag === "TemporarySplit" ? Option.some(entry.splitViewId) : Option.none(),
  )

describe("データの書き出し", () => {
  it.live(
    "設定画面が求めると、Space・ピン留め・一時タブ・Favorites・設定を書いたファイルの中身を返す",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedStorage("sync", { "katip/settings": { newTabsOnTop: false } })
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [
              { url: "https://calendar.example.com/", title: "カレンダー", pinned: true },
              { url: "https://mail.example.com/", title: "メール" },
              { url: "https://docs.example.com/", title: "設計" },
              { url: "https://tracker.example.com/", title: "課題" },
              { url: "https://news.example.com/", title: "ニュース" },
              { url: "https://blog.example.com/", title: "ブログ" },
            ],
          })
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          const home = (yield* sidebar.viewWhere((v) => v.spaces.length === 1)).activeSpaceId
          const atRoot = (index: number) => ({ spaceId: home, parentId: null, index })
          yield* sidebar.run({ _tag: "PlaceTabInPinned", tabId: tabIds[1], placement: atRoot(0) })
          yield* sidebar.run({ _tag: "SplitTabs", tabId: tabIds[3], withTabId: tabIds[2] })
          const splitViewId = yield* sidebar.viewWhere((v) => Option.isSome(splitViewIdIn(v)))
          yield* sidebar.run({
            _tag: "PlaceSplitInPinned",
            splitViewId: Option.getOrThrow(splitViewIdIn(splitViewId)),
            placement: atRoot(1),
          })
          const folder = yield* createdIdOf(
            yield* sidebar.run({ _tag: "CreateFolder", spaceId: home, parentId: null }),
          )
          yield* sidebar.run({ _tag: "RenamePinnedItem", bookmarkId: folder, title: "読みもの" })
          yield* sidebar.run({ _tag: "SetFolderIcon", bookmarkId: folder, icon: "star" })
          const live = yield* createdIdOf(
            yield* sidebar.run({
              _tag: "CreateLiveFolder",
              spaceId: home,
              parentId: null,
              source: { _tag: "GitHub", query: "mentioned" },
            }),
          )
          yield* sidebar.run({ _tag: "RenamePinnedItem", bookmarkId: live, title: "メンション" })
          yield* sidebar.run({ _tag: "SetLiveFolderSort", bookmarkId: live, sort: "oldest" })
          yield* sidebar.run({ _tag: "RenameTab", tabId: tabIds[5], title: "あとで読む" })
          const theme = themeOf([{ hue: 145, chroma: 0.6 }])
          yield* sidebar.run({
            _tag: "CreateSpace",
            windowId,
            name: SpaceName.make("仕事"),
            theme,
          })
          const view = yield* sidebar.viewWhere((v) => v.spaces.length === 2)

          const document = Result.getOrThrow(decodeExportFile(yield* exportedContent))

          expect({
            generator: document.generator,
            spaces: document.spaces,
            favorites: document.favorites,
            newTabsOnTop: document.settings.newTabsOnTop,
          }).toStrictEqual({
            generator: { name: "Katip", version: "0.0.0-test" },
            spaces: [
              {
                id: home,
                name: "ホーム",
                theme: Option.getOrThrow(spaceNamed(view, "ホーム")).theme,
                pinned: [
                  { type: "pin", title: "メール", url: "https://mail.example.com/" },
                  {
                    type: "split",
                    items: [
                      { type: "pin", title: "設計", url: "https://docs.example.com/" },
                      { type: "pin", title: "課題", url: "https://tracker.example.com/" },
                    ],
                  },
                  { type: "folder", title: "読みもの", icon: "star", children: [] },
                  {
                    type: "liveFolder",
                    title: "メンション",
                    source: { kind: "github", query: "mentioned" },
                    sort: "oldest",
                  },
                ],
                tabs: [
                  { title: "ニュース", url: "https://news.example.com/" },
                  { title: "あとで読む", url: "https://blog.example.com/" },
                ],
              },
              {
                id: Option.getOrThrow(spaceNamed(view, "仕事")).id,
                name: "仕事",
                theme,
                pinned: [],
                // Space を作ると、その Space に新しいタブが開く
                tabs: [{ title: "chrome://newtab/", url: "chrome://newtab/" }],
              },
            ],
            favorites: [{ title: "カレンダー", url: "https://calendar.example.com/" }],
            newTabsOnTop: false,
          })
        }),
      ),
  )

  it.live("GitHub のトークンは書き出さない", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((v) => v.spaces.length === 1)
        yield* sidebar.run({ _tag: "SetGitHubToken", token: "ghp_exampleSecretToken" })

        const content = yield* exportedContent

        expect(content).not.toContain("ghp_exampleSecretToken")
      }),
    ),
  )

  it.live("他の拡張機能から接続されても、書き出さずに切る", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const port = yield* fake.connect(EXPORT_PORT_NAME, {
          external: true,
          url: Option.some("chrome-extension://abcdefghijklmnopabcdefghijklmnop/"),
          origin: Option.some("chrome-extension://abcdefghijklmnopabcdefghijklmnop"),
          tabId: Option.none(),
        })
        yield* port.post(exportRequest)

        yield* port.disconnected.pipe(Effect.timeout("2 seconds"))
        const received = yield* Stream.runCollect(port.messages)

        expect(received).toStrictEqual([])
      }),
    ),
  )
})

describe("書き出しの求めへの返事", () => {
  const answerWith = (content: Effect.Effect<string, unknown>) =>
    Effect.gen(function* () {
      const fake = yield* FakeBrowser
      const port = yield* fake.connect(EXPORT_PORT_NAME)
      const served = yield* (yield* BrowserEvents).connections.pipe(Stream.runHead)
      yield* Effect.forkScoped(serveDataExport(Option.getOrThrow(served), content))
      yield* port.post(exportRequest)
      const reply = yield* port.messages.pipe(Stream.runHead, Effect.timeout("2 seconds"))
      return yield* decodeServerMessage(Option.getOrThrow(reply))
    })

  it.live("中身を作れれば、その中身を返す", () =>
    inBackground(
      Effect.gen(function* () {
        expect(yield* answerWith(Effect.succeed("{}"))).toStrictEqual({
          _tag: "Exported",
          content: "{}",
        })
      }),
    ),
  )

  it.live("中身を作れなければ、書き出せなかったと返す", () =>
    inBackground(
      Effect.gen(function* () {
        expect(yield* answerWith(Effect.fail("ピン留めを読めない"))).toStrictEqual({
          _tag: "Failed",
        })
      }),
    ),
  )

  it.live("中身を作る途中で予期しない誤りが起きても、書き出せなかったと返す", () =>
    inBackground(
      Effect.gen(function* () {
        expect(yield* answerWith(Effect.die(new Error("予期しない誤り")))).toStrictEqual({
          _tag: "Failed",
        })
      }),
    ),
  )
})
