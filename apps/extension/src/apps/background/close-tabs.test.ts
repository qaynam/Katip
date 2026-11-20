import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, type Scope } from "effect"
import { TabId, Tabs } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { backgroundTestLayer, openSidebar, startBackground } from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

describe("closing the tabs the side panel showed", () => {
  it.live("closes those still open, passing over one closed meanwhile", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId, tabIds } = yield* fake.seedWindow({
          tabs: [
            { url: "https://a.example/", title: "A" },
            { url: "https://b.example/", title: "B" },
            { url: "https://c.example/", title: "C" },
          ],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)

        const outcome = yield* sidebar.run({
          _tag: "CloseTabs",
          tabIds: [tabIds[0], tabIds[2], TabId.make(999)],
        })

        const left = yield* (yield* Tabs).query({ windowId })
        expect([outcome._tag, left.map((tab) => tab.id)]).toStrictEqual(["Succeeded", [tabIds[1]]])
      }),
    ),
  )
})
