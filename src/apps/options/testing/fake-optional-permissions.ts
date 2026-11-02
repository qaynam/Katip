import { Context, Effect, Layer, PubSub, Ref, Stream } from "effect"
import {
  type OptionalAccess,
  OptionalPermissions,
  type PermissionChange,
} from "../optional-permissions"

export type PermissionAnswer = "Grant" | "Deny"

/**
 * For tests. Decides how the user answers permission requests, and grants or removes permissions as
 * if from another page. `FakeOptionalPermissions.layer` provides this and {@link OptionalPermissions}
 * sharing one state. No permission is granted at first, and requests are granted.
 */
export class FakeOptionalPermissions extends Context.Service<
  FakeOptionalPermissions,
  {
    answerRequestsWith(answer: PermissionAnswer): Effect.Effect<void>
    grantElsewhere(access: OptionalAccess): Effect.Effect<void>
    revokeElsewhere(access: OptionalAccess): Effect.Effect<void>
    /** The permissions asked for, in the order they were asked for. */
    readonly requested: Effect.Effect<ReadonlyArray<OptionalAccess>>
    /** The permissions removed, in the order they were removed. */
    readonly removed: Effect.Effect<ReadonlyArray<OptionalAccess>>
  }
>()("katip/options/testing/FakeOptionalPermissions") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const granted = yield* Ref.make<ReadonlySet<OptionalAccess>>(new Set())
      const answer = yield* Ref.make<PermissionAnswer>("Grant")
      const requested = yield* Ref.make<ReadonlyArray<OptionalAccess>>([])
      const removed = yield* Ref.make<ReadonlyArray<OptionalAccess>>([])
      const changes = yield* PubSub.unbounded<PermissionChange>()

      const setGranted = Effect.fnUntraced(function* (access: OptionalAccess, isGranted: boolean) {
        const before = yield* Ref.getAndUpdate(granted, (all) =>
          isGranted ? new Set([...all, access]) : new Set([...all].filter((a) => a !== access)),
        )
        if (before.has(access) !== isGranted) {
          yield* PubSub.publish(changes, isGranted ? "Added" : "Removed")
        }
      })

      const request = Effect.fnUntraced(function* (access: OptionalAccess) {
        yield* Ref.update(requested, (all) => [...all, access])
        if ((yield* Ref.get(granted)).has(access)) return true
        const isGranted = (yield* Ref.get(answer)) === "Grant"
        if (isGranted) yield* setGranted(access, true)
        return isGranted
      })

      const remove = Effect.fnUntraced(function* (access: OptionalAccess) {
        yield* Ref.update(removed, (all) => [...all, access])
        yield* setGranted(access, false)
        return true
      })

      return Context.make(
        OptionalPermissions,
        OptionalPermissions.of({
          contains: (access) => Effect.map(Ref.get(granted), (all) => all.has(access)),
          request,
          remove,
          changes: Stream.fromPubSub(changes),
        }),
      ).pipe(
        Context.add(
          FakeOptionalPermissions,
          FakeOptionalPermissions.of({
            answerRequestsWith: (next) => Ref.set(answer, next),
            grantElsewhere: (access) => setGranted(access, true),
            revokeElsewhere: (access) => setGranted(access, false),
            requested: Ref.get(requested),
            removed: Ref.get(removed),
          }),
        ),
      )
    }),
  )
}
