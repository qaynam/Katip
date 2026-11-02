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

/** Connects as the settings page, asks for an export, and receives the first answer. */
const requestExport = (sender?: PortSender) =>
  Effect.gen(function* () {
    const port = yield* (yield* FakeBrowser).connect(EXPORT_PORT_NAME, sender)
    yield* port.post(exportRequest)
    const reply = yield* port.messages.pipe(Stream.runHead, Effect.timeout("5 seconds"))
    return yield* Option.match(reply, {
      onNone: () => Effect.die(new Error("disconnected before an answer arrived")),
      onSome: decodeServerMessage,
    })
  })

const exportedContent = Effect.gen(function* () {
  const reply = yield* requestExport()
  return reply._tag === "Exported" ? reply.content : yield* Effect.die(new Error("couldn't export"))
})

const createdIdOf = (outcome: CommandOutcome) =>
  outcome._tag === "Succeeded" && outcome.createdBookmarkId !== null
    ? Effect.succeed(outcome.createdBookmarkId)
    : Effect.die(new Error("couldn't create the pin"))

const splitViewIdIn = (view: SidebarView) =>
  Array.findFirst(Option.getOrThrow(spaceNamed(view, "Home")).temporaryEntries, (entry) =>
    entry._tag === "TemporarySplit" ? Option.some(entry.splitViewId) : Option.none(),
  )

describe("data export", () => {
  it.live(
    "asked by the settings page, returns a file with the Spaces, pinned tabs, temporary tabs, Favorites, and settings",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedStorage("sync", { "katip/settings": { newTabsOnTop: false } })
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [
              { url: "https://calendar.example.com/", title: "Calendar", pinned: true },
              { url: "https://mail.example.com/", title: "Mail" },
              { url: "https://docs.example.com/", title: "Design" },
              { url: "https://tracker.example.com/", title: "Issues" },
              { url: "https://news.example.com/", title: "News" },
              { url: "https://blog.example.com/", title: "Blog" },
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
          yield* sidebar.run({ _tag: "RenamePinnedItem", bookmarkId: folder, title: "Reading" })
          yield* sidebar.run({ _tag: "SetFolderIcon", bookmarkId: folder, icon: "star" })
          const live = yield* createdIdOf(
            yield* sidebar.run({
              _tag: "CreateLiveFolder",
              spaceId: home,
              parentId: null,
              source: { _tag: "GitHub", query: "mentioned" },
            }),
          )
          yield* sidebar.run({ _tag: "RenamePinnedItem", bookmarkId: live, title: "Mentions" })
          yield* sidebar.run({ _tag: "SetLiveFolderSort", bookmarkId: live, sort: "oldest" })
          yield* sidebar.run({ _tag: "RenameTab", tabId: tabIds[5], title: "Read later" })
          const theme = themeOf([{ hue: 145, chroma: 0.6 }])
          yield* sidebar.run({
            _tag: "CreateSpace",
            windowId,
            name: SpaceName.make("Work"),
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
                name: "Home",
                theme: Option.getOrThrow(spaceNamed(view, "Home")).theme,
                pinned: [
                  { type: "pin", title: "Mail", url: "https://mail.example.com/" },
                  {
                    type: "split",
                    items: [
                      { type: "pin", title: "Design", url: "https://docs.example.com/" },
                      { type: "pin", title: "Issues", url: "https://tracker.example.com/" },
                    ],
                  },
                  { type: "folder", title: "Reading", icon: "star", children: [] },
                  {
                    type: "liveFolder",
                    title: "Mentions",
                    source: { kind: "github", query: "mentioned" },
                    sort: "oldest",
                  },
                ],
                tabs: [
                  { title: "News", url: "https://news.example.com/" },
                  { title: "Read later", url: "https://blog.example.com/" },
                ],
              },
              {
                id: Option.getOrThrow(spaceNamed(view, "Work")).id,
                name: "Work",
                theme,
                pinned: [],
                // Creating a Space opens a new tab in it
                tabs: [{ title: "chrome://newtab/", url: "chrome://newtab/" }],
              },
            ],
            favorites: [{ title: "Calendar", url: "https://calendar.example.com/" }],
            newTabsOnTop: false,
          })
        }),
      ),
  )

  it.live("leaves out the GitHub token", () =>
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

  it.live("a connection from another extension is closed without exporting", () =>
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

describe("answer to an export request", () => {
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

  it.live("when the content can be built, returns it", () =>
    inBackground(
      Effect.gen(function* () {
        expect(yield* answerWith(Effect.succeed("{}"))).toStrictEqual({
          _tag: "Exported",
          content: "{}",
        })
      }),
    ),
  )

  it.live("when the content can't be built, answers that the export failed", () =>
    inBackground(
      Effect.gen(function* () {
        expect(yield* answerWith(Effect.fail("can't read the pinned tabs"))).toStrictEqual({
          _tag: "Failed",
        })
      }),
    ),
  )

  it.live(
    "when building the content hits an unexpected defect, still answers that the export failed",
    () =>
      inBackground(
        Effect.gen(function* () {
          expect(yield* answerWith(Effect.die(new Error("unexpected defect")))).toStrictEqual({
            _tag: "Failed",
          })
        }),
      ),
  )
})
