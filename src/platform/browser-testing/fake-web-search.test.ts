import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option } from "effect"
import { TabId, Tabs, WebSearch } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"
import { fakeSearchUrl } from "./fake-web-search"

layer(FakeBrowser.layer, { buildPerTest: true })("WebSearch の fake", (it) => {
  describe("タブを指定して検索したとき", () => {
    it.effect("そのタブが検索結果のページへ移る", () =>
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

    it.effect("ページの移動を TabUpdated で知らせる", () =>
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

    it.effect("存在しないタブなら失敗する", () =>
      Effect.gen(function* () {
        const search = yield* WebSearch

        const error = yield* Effect.flip(search.query("katip", TabId.make(999)))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })
})
