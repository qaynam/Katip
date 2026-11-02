import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option } from "effect"
import { TabId, Tabs, WebSearch } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"
import { fakeSearchUrl } from "./fake-web-search"

layer(FakeBrowser.layer, { buildPerTest: true })("the fake WebSearch", (it) => {
  describe("searching in a given tab", () => {
    it.effect("navigates that tab to the results page", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const search = yield* WebSearch
        const tabs = yield* Tabs
        const { tabIds } = yield* fake.seedWindow({ tabs: [{}] })

        yield* search.query("effect ts", tabIds[0])

        assert.deepStrictEqual(
          (yield* tabs.get(tabIds[0])).url,
          Option.some(fakeSearchUrl("effect ts")),
        )
      }),
    )

    it.effect("reports the navigation with TabUpdated", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const search = yield* WebSearch
        const { tabIds } = yield* fake.seedWindow({ tabs: [{}] })

        yield* search.query("katip", tabIds[0])

        const [event] = yield* fake.takeEmittedEvents
        assert.deepStrictEqual(event?._tag === "TabUpdated" ? event.changes : undefined, {
          url: fakeSearchUrl("katip"),
        })
      }),
    )

    it.effect("fails for a tab that does not exist", () =>
      Effect.gen(function* () {
        const search = yield* WebSearch

        const error = yield* Effect.flip(search.query("katip", TabId.make(999)))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })
})
