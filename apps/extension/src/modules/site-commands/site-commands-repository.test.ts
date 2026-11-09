import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Latch, Layer, Option, Stream } from "effect"
import { Storage } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { CommandKeyword, CommandTitle, CommandUrl, SiteCommandId } from "./site-command"
import { emptySiteCommandList, withCommandAdded, withCommandRemoved } from "./site-command-list"
import { SiteCommands } from "./site-commands-repository"

const testLayer = SiteCommands.layer.pipe(Layer.provideMerge(FakeBrowser.layer))

const searchLinear = {
  id: SiteCommandId.make("a1"),
  title: CommandTitle.make("Search Linear"),
  url: CommandUrl.make("https://linear.app/search?q=%s"),
  keyword: CommandKeyword.make("lin"),
}

describe("the saved commands", () => {
  it.effect("are the list Katip starts with until something is saved", () =>
    Effect.gen(function* () {
      expect(yield* (yield* SiteCommands).get).toStrictEqual(emptySiteCommandList)
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("keep an update, which the next read returns", () =>
    Effect.gen(function* () {
      const commands = yield* SiteCommands

      const saved = yield* commands.update((list) => withCommandAdded(list, searchLinear))

      expect([saved, yield* commands.get]).toStrictEqual([
        { added: [searchLinear], removedDefaults: [] },
        { added: [searchLinear], removedDefaults: [] },
      ])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("apply concurrent updates one after the other, losing neither", () =>
    Effect.gen(function* () {
      const commands = yield* SiteCommands

      yield* Effect.all(
        [
          commands.update((list) => withCommandAdded(list, searchLinear)),
          commands.update((list) =>
            withCommandRemoved(list, { _tag: "Default", id: "google-doc" }),
          ),
        ],
        { concurrency: "unbounded" },
      )

      expect(yield* commands.get).toStrictEqual({
        added: [searchLinear],
        removedDefaults: ["google-doc"],
      })
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("are kept in local storage, where a long list fits", () =>
    Effect.gen(function* () {
      yield* (yield* SiteCommands).update((list) => withCommandAdded(list, searchLinear))

      const stored = yield* (yield* Storage).local.get("katip/site-commands")

      expect(Option.isSome(stored)).toBe(true)
    }).pipe(Effect.provide(testLayer)),
  )
})

describe("changes to the saved commands", () => {
  it.effect("start with the current list, then follow every save", () =>
    Effect.gen(function* () {
      const commands = yield* SiteCommands
      const subscribed = yield* Latch.make()
      const collecting = yield* commands.changes.pipe(
        Stream.tap(() => Latch.open(subscribed)),
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* subscribed.await

      yield* commands.update((list) => withCommandAdded(list, searchLinear))

      expect(yield* Fiber.join(collecting)).toStrictEqual([
        emptySiteCommandList,
        { added: [searchLinear], removedDefaults: [] },
      ])
    }).pipe(Effect.provide(testLayer)),
  )
})
