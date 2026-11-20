import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, type Scope } from "effect"
import { Storage, type TabId } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { FakePermissions } from "#platform/permissions"
import type { SidebarView, TabSoundView } from "#protocol"
import {
  backgroundTestLayer,
  openSidebar,
  spaceNamed,
  startBackground,
} from "./testing/background-harness"
import { FakePageSound } from "./testing/fake-page-sound"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const MUSIC = "https://music.example"
const speakerRule = { site: MUSIC, output: "External Speaker", volume: 1, method: "InPage" }

/** The sound shown on the temporary tab titled `title` in the Home Space; null when none. */
const soundOf = (view: SidebarView, title: string): TabSoundView | null =>
  Option.match(spaceNamed(view, "Home"), {
    onNone: () => null,
    onSome: (space) =>
      space.temporaryEntries
        .flatMap((entry) => (entry._tag === "TemporaryTab" ? [entry.tab] : [...entry.tabs]))
        .find((tab) => tab.title === title)?.sound ?? null,
  })

const savedRules = Effect.flatMap(Storage, (storage) =>
  Effect.map(storage.local.get("katip/sound-rules"), Option.getOrNull),
)

const settled = (pages: FakePageSound["Service"], tabId: TabId) =>
  pages.report(tabId, `${MUSIC}/song`, {
    _tag: "PageSoundApplied",
    status: { _tag: "Applied", output: "External Speaker" },
    outputs: ["MacBook Pro Speakers", "External Speaker"],
  })

describe("a site with an output kept for it", () => {
  it.live(
    "sends its open pages there, which show as playing there once they say so, and has Chrome give the script to its pages",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedStorage("local", { "katip/sound-rules": [speakerRule] })
          yield* (yield* FakePermissions).grant([`${MUSIC}/*`])
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [{ url: `${MUSIC}/song`, title: "Song" }],
          })
          const pages = yield* FakePageSound

          yield* startBackground
          const sidebar = yield* openSidebar(windowId)
          yield* sidebar.viewWhere((view) => soundOf(view, "Song")?.state === "Pending")
          yield* settled(pages, tabIds[0])
          const view = yield* sidebar.viewWhere((v) => soundOf(v, "Song")?.state === "Applied")

          expect([
            yield* pages.ordersTo(tabIds[0]),
            soundOf(view, "Song"),
            yield* pages.registered,
          ]).toStrictEqual([
            [{ _tag: "PlayOn", output: "External Speaker" }],
            { output: "External Speaker", scope: "Site", state: "Applied" },
            [`${MUSIC}/*`],
          ])
        }),
      ),
  )

  it.live("shows its pages as needing access while Katip may not access the site", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedStorage("local", { "katip/sound-rules": [speakerRule] })
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: `${MUSIC}/song`, title: "Song" }],
        })
        const pages = yield* FakePageSound

        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        const view = yield* sidebar.viewWhere((v) => soundOf(v, "Song")?.state === "NeedsAccess")

        expect([yield* pages.ordersTo(tabIds[0]), yield* pages.registered]).toStrictEqual([[], []])
        expect(soundOf(view, "Song")?.output).toBe("External Speaker")
      }),
    ),
  )

  it.live("shows a page that can't name the outputs as needing the microphone permission", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedStorage("local", { "katip/sound-rules": [speakerRule] })
        yield* (yield* FakePermissions).grant([`${MUSIC}/*`])
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: `${MUSIC}/song`, title: "Song" }],
        })
        const pages = yield* FakePageSound

        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((view) => soundOf(view, "Song")?.state === "Pending")
        yield* pages.report(tabIds[0], `${MUSIC}/song`, {
          _tag: "PageSoundApplied",
          status: { _tag: "NeedsMicrophone" },
          outputs: [],
        })

        yield* sidebar.viewWhere((view) => soundOf(view, "Song")?.state === "NeedsMicrophone")
      }),
    ),
  )
})

describe("what pages report", () => {
  it.live("keeps the names of the outputs a page saw, for choosing in the settings", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedStorage("local", { "katip/sound-rules": [speakerRule] })
        yield* (yield* FakePermissions).grant([`${MUSIC}/*`])
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [{ url: `${MUSIC}/song`, title: "Song" }],
        })
        const pages = yield* FakePageSound
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((view) => soundOf(view, "Song")?.state === "Pending")

        yield* settled(pages, tabIds[0])
        yield* sidebar.viewWhere((view) => soundOf(view, "Song")?.state === "Applied")

        const storage = yield* Storage
        expect(Option.getOrNull(yield* storage.local.get("katip/sound-outputs"))).toStrictEqual([
          "MacBook Pro Speakers",
          "External Speaker",
        ])
      }),
    ),
  )
})

describe("choosing an output in the side panel", () => {
  it.live("for the site, sends every open page of the site there and keeps it for the site", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* (yield* FakePermissions).grant([`${MUSIC}/*`])
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [
            { url: `${MUSIC}/song`, title: "Song" },
            { url: `${MUSIC}/album`, title: "Album" },
            { url: "https://news.example/", title: "News" },
          ],
        })
        const pages = yield* FakePageSound
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)

        const outcome = yield* sidebar.run({
          _tag: "SetTabSoundOutput",
          tabId: tabIds[0],
          output: "External Speaker",
          scope: "Site",
        })
        yield* sidebar.viewWhere((view) => soundOf(view, "Album")?.state === "Pending")

        expect([
          outcome._tag,
          yield* pages.ordersTo(tabIds[0]),
          yield* pages.ordersTo(tabIds[1]),
          yield* pages.ordersTo(tabIds[2]),
          yield* savedRules,
        ]).toStrictEqual([
          "Succeeded",
          [{ _tag: "PlayOn", output: "External Speaker" }],
          [{ _tag: "PlayOn", output: "External Speaker" }],
          [],
          [speakerRule],
        ])
      }),
    ),
  )

  it.live(
    "for this tab only, keeps nothing for the site, and is forgotten once the tab goes to another site",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* (yield* FakePermissions).grant([`${MUSIC}/*`])
          const { windowId, tabIds } = yield* fake.seedWindow({
            tabs: [
              { url: `${MUSIC}/song`, title: "Song" },
              { url: `${MUSIC}/album`, title: "Album" },
            ],
          })
          const pages = yield* FakePageSound
          yield* startBackground
          const sidebar = yield* openSidebar(windowId)

          yield* sidebar.run({
            _tag: "SetTabSoundOutput",
            tabId: tabIds[0],
            output: "External Speaker",
            scope: "Tab",
          })
          const chosen = yield* sidebar.viewWhere((v) => soundOf(v, "Song")?.scope === "Tab")
          yield* fake.updatePage(tabIds[0], { url: "https://news.example/", title: "News" })
          const left = yield* sidebar.viewWhere((v) => soundOf(v, "News") === null)

          expect([
            soundOf(chosen, "Album"),
            yield* pages.ordersTo(tabIds[1]),
            yield* savedRules,
            soundOf(left, "News"),
          ]).toStrictEqual([null, [], null, null])
        }),
      ),
  )
})

describe("resetting a tab's output", () => {
  it.live("forgets the site's output and lets every page of the site go", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedStorage("local", { "katip/sound-rules": [speakerRule] })
        yield* (yield* FakePermissions).grant([`${MUSIC}/*`])
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [
            { url: `${MUSIC}/song`, title: "Song" },
            { url: `${MUSIC}/album`, title: "Album" },
          ],
        })
        const pages = yield* FakePageSound
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((view) => soundOf(view, "Album")?.state === "Pending")

        yield* sidebar.run({ _tag: "ResetTabSound", tabId: tabIds[0] })
        const view = yield* sidebar.viewWhere(
          (v) => soundOf(v, "Song") === null && soundOf(v, "Album") === null,
        )

        expect([
          (yield* pages.ordersTo(tabIds[1])).at(-1),
          yield* savedRules,
          yield* pages.registered,
          soundOf(view, "Song"),
        ]).toStrictEqual([{ _tag: "LetGo" }, [], [], null])
      }),
    ),
  )
})

describe("a page asking where its sound goes", () => {
  it.live("is told to leave its sound alone when its site has no output", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { tabIds } = yield* fake.seedWindow({
          tabs: [{ url: "https://news.example/", title: "News" }],
        })
        const pages = yield* FakePageSound
        yield* startBackground

        const reply = yield* pages.report(tabIds[0], "https://news.example/", {
          _tag: "PageSoundStarted",
        })

        expect(reply).toBeNull()
      }),
    ),
  )
})
