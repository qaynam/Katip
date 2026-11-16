import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { FakeNotifications } from "./fake-notifications"
import { Notifications } from "./notifications"

const notification = (title: string) => ({ title, message: "", contextMessage: "Inbox" })

const shownTitles = Effect.map(
  FakeNotifications.use((fake) => fake.shown),
  (all) => all.map(({ id, title }) => [id, title]),
)

describe("notifications shown by the fake", () => {
  it.effect("are listed in the order shown, until cleared", () =>
    Effect.gen(function* () {
      const notifications = yield* Notifications
      yield* notifications.show("a", notification("First"))
      yield* notifications.show("b", notification("Second"))

      yield* notifications.clear("a")

      assert.deepStrictEqual(yield* shownTitles, [["b", "Second"]])
    }).pipe(Effect.provide(FakeNotifications.layer)),
  )

  it.effect("one shown again under the same id replaces the first, keeping its place", () =>
    Effect.gen(function* () {
      const notifications = yield* Notifications
      yield* notifications.show("a", notification("First"))
      yield* notifications.show("b", notification("Second"))

      yield* notifications.show("a", notification("First, updated"))

      assert.deepStrictEqual(yield* shownTitles, [
        ["a", "First, updated"],
        ["b", "Second"],
      ])
    }).pipe(Effect.provide(FakeNotifications.layer)),
  )
})
