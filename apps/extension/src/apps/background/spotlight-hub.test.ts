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
import { FakeScripting } from "#platform/scripting"
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

/** Connects to the background as Spotlight opened over the `callerWindowId` window. */
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
        reply._tag === "SearchResults" ? Effect.succeed(reply) : Effect.die("not a search answer"),
    )

  const choose = (result: SpotlightResult) =>
    Effect.flatMap(
      ask((requestId) => ({ _tag: "Choose", requestId, windowId: callerWindowId, result })),
      (reply) =>
        reply._tag === "ChoiceSettled"
          ? Effect.succeed(reply.outcome)
          : Effect.die("not a choice answer"),
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

/** Subscribes as a side panel, and returns an Effect that waits for the next notice. */
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
      onNone: () => Effect.die("no Space"),
      onSome: (space) => Effect.succeed(space.id),
    }),
  ),
)

const run = (command: SidebarCommand) =>
  Effect.tap(runSidebarCommand(command), (outcome) =>
    outcome._tag === "Failed" ? Effect.die(outcome.reason) : Effect.void,
  )

const BOOKMARKS_BAR = BookmarkId.make("1")

describe("Spotlight search", () => {
  it.effect(
    "returns the open tabs matching the query, with the name of the Space each belongs to",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId } = yield* fake.seedWindow({
            tabs: [
              { url: "https://docs.example/", title: "Design document" },
              { url: "https://news.example/", title: "News" },
            ],
          })
          yield* initialize
          const spotlight = yield* connectSpotlight(windowId)

          const { results } = yield* spotlight.search("design")

          expect(openTabs(results).map(({ title, spaceName }) => [title, spaceName])).toStrictEqual(
            [["Design document", "Home"]],
          )
        }),
      ),
  )

  it.effect("returns a Favorites tab as belonging to no Space", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({
          tabs: [{ url: "https://calendar.example/", title: "Calendar", pinned: true }, {}],
        })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("calendar")

        expect(
          openTabs(results).map(({ isFavorite, spaceName }) => ({ isFavorite, spaceName })),
        ).toStrictEqual([{ isFavorite: true, spaceName: null }])
      }),
    ),
  )

  it.effect("returns a tab of another window too, marked as in another window", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const caller = yield* fake.seedWindow({ tabs: [{ title: "Nearby tab" }] })
        yield* fake.seedWindow({ tabs: [{ url: "https://far.example/", title: "Faraway tab" }] })
        yield* initialize
        const spotlight = yield* connectSpotlight(caller.windowId)

        const { results } = yield* spotlight.search("faraway")

        expect(openTabs(results).map(({ isInOtherWindow }) => isInOtherWindow)).toStrictEqual([
          true,
        ])
      }),
    ),
  )

  it.effect("never returns Spotlight's own page", () =>
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

  it.effect("returns a closed pin with the names of its Space and folders", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/", title: "Mail" }, {}],
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

        const { results } = yield* spotlight.search("mail")

        expect(
          pins(results).map(({ title, spaceName, folderPath }) => ({
            title,
            spaceName,
            folderPath,
          })),
        ).toStrictEqual([{ title: "Mail", spaceName: "Home", folderPath: ["New Folder"] }])
      }),
    ),
  )

  it.effect("returns an open pin not as a pin but as a tab with the pin's name", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/", title: "Inbox (3)" }, {}],
        })
        yield* initialize
        yield* run({ _tag: "PinTab", tabId: tabIds[0] })
        yield* run({ _tag: "RenameTab", tabId: tabIds[0], title: "Work mail" })
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("work mail")

        expect([openTabs(results).map(({ title }) => title), pins(results)]).toStrictEqual([
          ["Work mail"],
          [],
        ])
      }),
    ),
  )

  it.effect("returns the Spaces, marking the one current in the calling window", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* initialize
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("Work") })
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("")

        expect(spaces(results).map(({ name, isActive }) => [name, isActive])).toStrictEqual([
          ["Home", false],
          ["Work", true],
        ])
      }),
    ),
  )

  it.effect("also returns bookmarks outside Katip, but not a pin's bookmark as a bookmark", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://effect.website/blog", title: "Effect blog" }, {}],
        })
        yield* fake.seedBookmarks(BOOKMARKS_BAR, [
          { title: "Effect docs", url: "https://effect.website/docs" },
        ])
        yield* initialize
        yield* run({ _tag: "PinTab", tabId: tabIds[0] })
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("effect")

        expect(bookmarks(results).map(({ title }) => title)).toStrictEqual(["Effect docs"])
      }),
    ),
  )

  it.effect("never returns bookmarklets", () =>
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

  it.effect("returns the tabs even when bookmarks can't be searched", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({
          tabs: [{ url: "https://docs.example/", title: "Design document" }, {}],
        })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)
        yield* fake.failNext("bookmarks.search")

        const { results } = yield* spotlight.search("design")

        expect(openTabs(results).map(({ title }) => title)).toStrictEqual(["Design document"])
      }),
    ),
  )

  it.effect("returns an item for searching the web for the input, last", () =>
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

  it.effect("includes the theme of the Space current in the calling window", () =>
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

describe("choosing a Spotlight result", () => {
  it.effect("choosing an open tab activates it and brings its window to the front", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const caller = yield* fake.seedWindow({ tabs: [{}], focused: true })
        const other = yield* fake.seedWindow({
          tabs: [{}, { url: "https://far.example/", title: "Faraway tab" }],
        })
        yield* initialize
        const spotlight = yield* connectSpotlight(caller.windowId)
        const [found] = openTabs((yield* spotlight.search("faraway")).results)

        const outcome = yield* spotlight.choose(found ?? (yield* Effect.die("no result")))

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

  it.effect("choosing a closed pin opens the pin's tab in the calling window", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example/", title: "Mail" }, {}],
        })
        yield* initialize
        yield* run({ _tag: "PinTab", tabId: tabIds[0] })
        yield* (yield* Tabs).remove([tabIds[0]])
        const spotlight = yield* connectSpotlight(windowId)
        const [pin] = pins((yield* spotlight.search("mail")).results)

        yield* spotlight.choose(pin ?? (yield* Effect.die("no result")))

        const { results } = yield* spotlight.search("mail")
        expect(openTabs(results).map(({ url, spaceName }) => [url, spaceName])).toStrictEqual([
          ["https://mail.example/", "Home"],
        ])
      }),
    ),
  )

  it.effect("choosing a Space switches the calling window to it", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* initialize
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("Work") })
        const spotlight = yield* connectSpotlight(windowId)
        const [home] = spaces((yield* spotlight.search("home")).results)

        yield* spotlight.choose(home ?? (yield* Effect.die("no result")))

        const { results } = yield* spotlight.search("")
        expect(
          spaces(results).flatMap(({ name, isActive }) => (isActive ? [name] : [])),
        ).toStrictEqual(["Home"])
      }),
    ),
  )

  it.effect("choosing a bookmark opens it in a new tab of the calling window's current Space", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* fake.seedBookmarks(BOOKMARKS_BAR, [
          { title: "Effect docs", url: "https://effect.website/docs" },
        ])
        yield* initialize
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("Work") })
        const spotlight = yield* connectSpotlight(windowId)
        const [bookmark] = bookmarks((yield* spotlight.search("effect")).results)

        yield* spotlight.choose(bookmark ?? (yield* Effect.die("no result")))

        const { results } = yield* spotlight.search("effect.website")
        expect(
          openTabs(results).map(({ url, spaceName, isInOtherWindow }) => ({
            url,
            spaceName,
            isInOtherWindow,
          })),
        ).toStrictEqual([
          { url: "https://effect.website/docs", spaceName: "Work", isInOtherWindow: false },
        ])
      }),
    ),
  )

  it.effect(
    "choosing the item for opening a URL opens it as the active tab in the calling window",
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

  it.effect("choosing the web search item searches in a new tab of the calling window", () =>
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

  it.effect("after opening a page, returns focus from Spotlight to the calling window", () =>
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

  it.effect("when the chosen tab has already closed, returns that it couldn't be opened", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{}, { url: "https://gone.example/", title: "Closing tab" }],
        })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)
        const [found] = openTabs((yield* spotlight.search("closing")).results)
        yield* (yield* Tabs).remove([tabIds[1]])

        const outcome = yield* spotlight.choose(found ?? (yield* Effect.die("no result")))

        expect(outcome._tag).toBe("Failed")
      }),
    ),
  )
})

const firstOf = <A>(found: ReadonlyArray<A>) =>
  Option.match(Array.head(found), {
    onNone: () => Effect.die("no result"),
    onSome: Effect.succeed,
  })

describe("Spotlight commands", () => {
  it.effect(
    "searching commands only lists the available commands in a set order, even with no input",
    () =>
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
            "Copy URL",
            "Copy URL as Markdown Link",
            "Pin Tab",
            "Duplicate Tab",
            "Close Tab",
            "Mute Tab",
            "Close All Temporary Tabs",
            "Open Settings",
          ])
        }),
      ),
  )

  it.effect("offers moving the tab to each Space other than the one it's in", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://a.example/" }],
        })
        yield* initialize
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("Work") })
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("Hobbies") })
        yield* (yield* Tabs).update(tabIds[0], { active: true })
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("", "Actions")

        expect(actionsOfKind("MoveTabToSpace")(results).map(({ title }) => title)).toStrictEqual([
          "Move Tab to Work",
          "Move Tab to Hobbies",
        ])
      }),
    ),
  )

  it.effect("for a muted tab, offers unmuting instead", () =>
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
          "Unmute Tab",
        ])
      }),
    ),
  )

  it.effect(
    "in a normal search, a command shown in another language is also found by its English name",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
          yield* initialize
          yield* (yield* SettingsRepository).update({ locale: "es" })
          const spotlight = yield* connectSpotlight(windowId)

          const { results } = yield* spotlight.search("duplicate")

          expect(actions(results).map(({ title }) => title)).toStrictEqual(["Duplicar pestaña"])
        }),
      ),
  )

  it.effect("a normal search with no input lists no commands", () =>
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

  it.effect("shows the key assigned in Chrome next to the actions that have one", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* initialize
        yield* (yield* SettingsRepository).update({ pageShortcuts: { copyUrl: true } })
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("", "Actions")

        expect(
          actions(results)
            .slice(0, 4)
            .map(({ action, shortcut }) => [action._tag, shortcut]),
        ).toStrictEqual([
          ["CopyUrl", "⌃⇧C"],
          ["CopyMarkdownLink", null],
          ["TogglePin", "⌥D"],
          ["DuplicateTab", null],
        ])
      }),
      KeyboardShortcuts.layerTest({
        assigned: { "copy-current-url": "⌃⇧C", "quick-pin-toggle": "⌥D" },
      }),
    ),
  )

  it.effect("shows no key next to a copy action whose shortcut is turned off in the settings", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* initialize
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("", "Actions")

        expect(
          actions(results)
            .filter(({ action }) => action._tag === "CopyUrl" || action._tag === "CopyMarkdownLink")
            .map(({ action, shortcut }) => [action._tag, shortcut]),
        ).toStrictEqual([
          ["CopyUrl", null],
          ["CopyMarkdownLink", null],
        ])
      }),
      KeyboardShortcuts.layerTest({
        assigned: { "copy-current-url": "⌃⇧C", "copy-current-url-as-markdown": "⌃⇧M" },
      }),
    ),
  )
})

describe("choosing a Spotlight command", () => {
  const seedPage = Effect.gen(function* () {
    const fake = yield* FakeBrowser
    const seeded = yield* fake.seedWindow({
      tabs: [{ url: "https://docs.example/guide", title: "Guide [draft]", active: true }],
    })
    yield* initialize
    return seeded
  })

  it.effect("choosing Copy URL copies the active tab's URL and shows a notice on that page", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabIds } = yield* seedPage
        const spotlight = yield* connectSpotlight(windowId)
        const copyUrl = yield* firstOf(
          actionsOfKind("CopyUrl")((yield* spotlight.search("", "Actions")).results),
        )

        const outcome = yield* spotlight.choose(copyUrl)

        expect({
          outcome,
          written: yield* (yield* ClipboardRecorder).written,
          shown: yield* (yield* FakeScripting).functionExecutions,
        }).toStrictEqual({
          outcome: { _tag: "Succeeded" },
          written: ["https://docs.example/guide"],
          shown: [{ tabId: tabIds[0], name: "showPageToast", args: ["Copied URL"] }],
        })
      }),
    ),
  )

  it.effect("when the notice can't be shown on the page, the side panel shows it", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabIds } = yield* seedPage
        yield* (yield* FakeScripting).failNextInjectionInto(tabIds[0])
        const nextNotice = yield* watchSidebarNotices(windowId)
        const spotlight = yield* connectSpotlight(windowId)
        const copyUrl = yield* firstOf(
          actionsOfKind("CopyUrl")((yield* spotlight.search("", "Actions")).results),
        )

        yield* spotlight.choose(copyUrl)

        expect(yield* nextNotice).toBe("Copied URL")
      }),
    ),
  )

  it.effect("choosing Copy URL as Markdown Link copies it as [title](URL)", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId } = yield* seedPage
        const spotlight = yield* connectSpotlight(windowId)
        const copyLink = yield* firstOf(
          actionsOfKind("CopyMarkdownLink")((yield* spotlight.search("", "Actions")).results),
        )

        yield* spotlight.choose(copyLink)

        expect(yield* (yield* ClipboardRecorder).written).toStrictEqual([
          "[Guide \\[draft\\]](https://docs.example/guide)",
        ])
      }),
    ),
  )

  it.effect("choosing Mute Tab mutes the active tab", () =>
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

  it.effect("choosing Duplicate Tab adds a tab with the same page", () =>
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

  it.effect("choosing to move to another Space moves the active tab to it", () =>
    inBackground(
      Effect.gen(function* () {
        const { windowId, tabIds } = yield* seedPage
        yield* run({ _tag: "CreateSpace", windowId, name: SpaceName.make("Work") })
        yield* (yield* Tabs).update(tabIds[0], { active: true })
        const spotlight = yield* connectSpotlight(windowId)
        const move = yield* firstOf(
          actionsOfKind("MoveTabToSpace")((yield* spotlight.search("", "Actions")).results),
        )

        yield* spotlight.choose(move)

        const moved = openTabs((yield* spotlight.search("guide")).results)
        expect([move.title, moved.map(({ spaceName }) => spaceName)]).toStrictEqual([
          "Move Tab to Work",
          ["Work"],
        ])
      }),
    ),
  )
})

describe("Spotlight history results", () => {
  const seedHistory = Effect.gen(function* () {
    const fake = yield* FakeBrowser
    const { windowId } = yield* fake.seedWindow({
      tabs: [{ url: "https://katip.example/open", title: "Katip open page" }],
    })
    yield* (yield* FakeHistory).seed([
      { url: "https://katip.example/open", title: "Katip open page", lastVisitedAt: 300 },
      { url: "https://katip.example/docs", title: "Katip docs", lastVisitedAt: 200 },
    ])
    yield* initialize
    return windowId
  })

  it.effect(
    "with the history permission, browsing history pages matching the input are listed too",
    () =>
      inBackground(
        Effect.gen(function* () {
          const windowId = yield* seedHistory
          yield* (yield* FakePermissions).grantPermissions(["history"])
          const spotlight = yield* connectSpotlight(windowId)

          const { results } = yield* spotlight.search("katip")

          expect(histories(results)).toStrictEqual([
            {
              _tag: "History",
              title: "Katip docs",
              url: "https://katip.example/docs",
              lastVisitedAt: 200,
            },
          ])
        }),
      ),
  )

  it.effect("leaves out history with the same URL as an open tab", () =>
    inBackground(
      Effect.gen(function* () {
        const windowId = yield* seedHistory
        yield* (yield* FakePermissions).grantPermissions(["history"])
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("open page")

        expect([openTabs(results).length, histories(results)]).toStrictEqual([1, []])
      }),
    ),
  )

  it.effect("without the history permission, doesn't read the browsing history", () =>
    inBackground(
      Effect.gen(function* () {
        const windowId = yield* seedHistory
        const spotlight = yield* connectSpotlight(windowId)

        const { results } = yield* spotlight.search("katip")

        expect([histories(results), yield* (yield* FakeHistory).searches]).toStrictEqual([[], []])
      }),
    ),
  )

  it.effect("with no input, doesn't read the browsing history", () =>
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

  it.effect("choosing a history page opens it in the calling window's current Space", () =>
    inBackground(
      Effect.gen(function* () {
        const windowId = yield* seedHistory
        yield* (yield* FakePermissions).grantPermissions(["history"])
        const spotlight = yield* connectSpotlight(windowId)
        const page = yield* firstOf(histories((yield* spotlight.search("docs")).results))

        yield* spotlight.choose(page)

        const opened = openTabs((yield* spotlight.search("katip.example/docs")).results)
        expect(opened.map(({ url, spaceName }) => [url, spaceName])).toStrictEqual([
          ["https://katip.example/docs", "Home"],
        ])
      }),
    ),
  )
})
