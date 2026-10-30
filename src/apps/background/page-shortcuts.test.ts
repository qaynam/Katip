import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema, type Layer, type Scope, Stream } from "effect"
import type { PageShortcut } from "#modules/page-shortcuts"
import { type PortSender, Storage, type TabId } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { ClipboardRecorder } from "#platform/clipboard"
import { FakePermissions } from "#platform/permissions"
import { FakeScripting } from "#platform/scripting"
import {
  ENABLED_PAGE_SHORTCUTS_KEY,
  PAGE_SHORTCUT_PORT_NAME,
  PageShortcutServerMessage,
} from "#protocol"
import { backgroundTestLayer, eventually, startBackground } from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const ALL_SITES = "*://*/*"

const pageShortcutSettings = (settings: { copyUrl?: boolean; copyMarkdownLink?: boolean }) => ({
  "katip/settings": { pageShortcuts: settings },
})

const someWhen = <A>(value: A, condition: (value: A) => boolean) =>
  condition(value) ? Option.some(value) : Option.none()

const registeredScripts = FakeScripting.use((scripting) => scripting.registered)

const scriptsWhen = (condition: (count: number) => boolean) =>
  eventually(
    Effect.map(registeredScripts, (all) => someWhen(all, (some) => condition(some.length))),
  )

const storedEnabled = Storage.use((storage) => storage.local.get(ENABLED_PAGE_SHORTCUTS_KEY))

const enabledListWhen = (expected: ReadonlyArray<PageShortcut>) =>
  eventually(
    Effect.map(storedEnabled, (stored) =>
      Option.filter(stored, (list) => JSON.stringify(list) === JSON.stringify(expected)),
    ),
  )

const openPage = { url: "https://news.example/article", title: "今日の記事" }

/** ショートカットを有効にし、すべてのサイトへのアクセスを許可した状態で起動する。 */
const startWithShortcuts = (settings: { copyUrl?: boolean; copyMarkdownLink?: boolean }) =>
  Effect.gen(function* () {
    const fake = yield* FakeBrowser
    const seeded = yield* fake.seedWindow({ tabs: [openPage, { url: "chrome://settings/" }] })
    yield* fake.seedStorage("sync", pageShortcutSettings(settings))
    yield* (yield* FakePermissions).grant([ALL_SITES])
    yield* startBackground
    return seeded.tabIds
  })

const decodeReply = Schema.decodeUnknownEffect(PageShortcutServerMessage)

const senderInTab = (tabId: TabId): PortSender => ({
  external: false,
  url: Option.some(openPage.url),
  origin: Option.some("https://news.example"),
  tabId: Option.some(tabId),
})

/** ページのスクリプトとして接続し、ショートカットを押したことを送って返事を待つ。 */
const pressInPage = (shortcut: PageShortcut, sender: PortSender) =>
  Effect.gen(function* () {
    const port = yield* (yield* FakeBrowser).connect(PAGE_SHORTCUT_PORT_NAME, sender)
    yield* port.post({ _tag: "Run", shortcut })
    const reply = yield* port.messages.pipe(Stream.runHead, Effect.timeout("3 seconds"))
    return yield* decodeReply(Option.getOrUndefined(reply))
  })

describe("ページのスクリプトの登録", () => {
  it.live(
    "ショートカットを有効にし、すべてのサイトへの許可があると、ページのスクリプトを登録する",
    () =>
      inBackground(
        Effect.gen(function* () {
          yield* startWithShortcuts({ copyUrl: true })

          const scripts = yield* scriptsWhen((count) => count > 0)

          expect(scripts).toStrictEqual([
            {
              id: "katip-page-shortcuts",
              js: ["page-shortcuts.js"],
              matches: [ALL_SITES],
              runAt: "document_start",
              allFrames: false,
              persistAcrossSessions: true,
            },
          ])
        }),
      ),
  )

  it.live("有効にしたショートカットの一覧を、ページのスクリプトが読める場所に置く", () =>
    inBackground(
      Effect.gen(function* () {
        yield* startWithShortcuts({ copyMarkdownLink: true })

        const stored = yield* enabledListWhen(["CopyMarkdownLink"])

        expect(stored).toStrictEqual(["CopyMarkdownLink"])
      }),
    ),
  )

  it.live("新しく有効になったときは、開いている Web ページにもすぐ入れる", () =>
    inBackground(
      Effect.gen(function* () {
        const [webPage] = yield* startWithShortcuts({ copyUrl: true })

        const injections = yield* eventually(
          Effect.map(
            FakeScripting.use((scripting) => scripting.injections),
            (all) => someWhen(all, (some) => some.length > 0),
          ),
        )

        expect(injections).toStrictEqual([{ tabId: webPage, files: ["page-shortcuts.js"] }])
      }),
    ),
  )

  it.live("すべてのサイトへの許可が無ければ登録せず、有効な一覧も空にする", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedWindow({ tabs: [openPage] })
        yield* fake.seedStorage("sync", pageShortcutSettings({ copyUrl: true }))
        yield* startBackground

        yield* enabledListWhen([])

        expect(yield* registeredScripts).toStrictEqual([])
      }),
    ),
  )

  it.live("後からすべてのサイトへのアクセスを許可すると、その時点で登録する", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedWindow({ tabs: [openPage] })
        yield* fake.seedStorage("sync", pageShortcutSettings({ copyUrl: true }))
        yield* startBackground
        yield* enabledListWhen([])

        yield* (yield* FakePermissions).grant([ALL_SITES])

        yield* scriptsWhen((count) => count === 1)
        expect(yield* enabledListWhen(["CopyUrl"])).toStrictEqual(["CopyUrl"])
      }),
    ),
  )

  it.live("すべて無効にすると登録を外し、有効な一覧を空にする", () =>
    inBackground(
      Effect.gen(function* () {
        yield* startWithShortcuts({ copyUrl: true, copyMarkdownLink: true })
        yield* scriptsWhen((count) => count > 0)

        yield* (yield* Storage).sync.set(
          "katip/settings",
          pageShortcutSettings({ copyUrl: false, copyMarkdownLink: false })["katip/settings"],
        )

        yield* scriptsWhen((count) => count === 0)
        expect(yield* enabledListWhen([])).toStrictEqual([])
      }),
    ),
  )

  it.live("すべてのサイトへの許可を取り消すと、登録を外す", () =>
    inBackground(
      Effect.gen(function* () {
        yield* startWithShortcuts({ copyUrl: true })
        yield* scriptsWhen((count) => count > 0)

        yield* (yield* FakePermissions).revoke([ALL_SITES])

        yield* scriptsWhen((count) => count === 0)
        expect(yield* enabledListWhen([])).toStrictEqual([])
      }),
    ),
  )
})

describe("ページでショートカットを押したとき", () => {
  it.live("URL のコピーなら、そのタブの URL がクリップボードに入り、知らせが返る", () =>
    inBackground(
      Effect.gen(function* () {
        const [tabId] = yield* startWithShortcuts({ copyUrl: true })

        const reply = yield* pressInPage("CopyUrl", senderInTab(tabId))

        expect(reply).toStrictEqual({ _tag: "Done", notice: "URL をコピーしました" })
        expect(yield* (yield* ClipboardRecorder).written).toStrictEqual([openPage.url])
      }),
    ),
  )

  it.live("Markdown のコピーなら、[タイトル](URL) がクリップボードに入る", () =>
    inBackground(
      Effect.gen(function* () {
        const [tabId] = yield* startWithShortcuts({ copyMarkdownLink: true })

        const reply = yield* pressInPage("CopyMarkdownLink", senderInTab(tabId))

        expect(reply).toStrictEqual({ _tag: "Done", notice: "Markdown のリンクをコピーしました" })
        expect(yield* (yield* ClipboardRecorder).written).toStrictEqual([
          "[今日の記事](https://news.example/article)",
        ])
      }),
    ),
  )

  it.live("無効にしているショートカットが届いても写さず、できなかったことを返す", () =>
    inBackground(
      Effect.gen(function* () {
        const [tabId] = yield* startWithShortcuts({ copyUrl: true })

        const reply = yield* pressInPage("CopyMarkdownLink", senderInTab(tabId))

        expect(reply).toStrictEqual({ _tag: "Failed", reason: "コピーできませんでした" })
        expect(yield* (yield* ClipboardRecorder).written).toStrictEqual([])
      }),
    ),
  )

  it.live("どのタブからの接続か分からなければ写さない", () =>
    inBackground(
      Effect.gen(function* () {
        const [tabId] = yield* startWithShortcuts({ copyUrl: true })

        const reply = yield* pressInPage("CopyUrl", {
          ...senderInTab(tabId),
          tabId: Option.none(),
        })

        expect(reply._tag).toBe("Failed")
        expect(yield* (yield* ClipboardRecorder).written).toStrictEqual([])
      }),
    ),
  )
})
