import { Context, Effect, Layer, Ref } from "effect"
import { Notifications, type SystemNotification } from "./notifications"

export interface ShownNotification extends SystemNotification {
  readonly id: string
}

/**
 * For tests: keeps the notifications shown and not yet cleared, as the system would list them.
 * `FakeNotifications.layer` provides this and {@link Notifications} sharing the same state.
 */
export class FakeNotifications extends Context.Service<
  FakeNotifications,
  {
    /** In the order first shown. One shown again under the same id keeps its place. */
    readonly shown: Effect.Effect<ReadonlyArray<ShownNotification>>
  }
>()("katip/platform/notifications/FakeNotifications") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const shown = yield* Ref.make<ReadonlyArray<ShownNotification>>([])

      const show = (id: string, notification: SystemNotification) =>
        Ref.update(shown, (all) =>
          all.some((each) => each.id === id)
            ? all.map((each) => (each.id === id ? { id, ...notification } : each))
            : [...all, { id, ...notification }],
        )

      return Context.make(
        Notifications,
        Notifications.of({
          show,
          clear: (id) => Ref.update(shown, (all) => all.filter((each) => each.id !== id)),
        }),
      ).pipe(Context.add(FakeNotifications, FakeNotifications.of({ shown: Ref.get(shown) })))
    }),
  )
}
