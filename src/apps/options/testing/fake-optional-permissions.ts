import { Context, Effect, Layer, PubSub, Ref, Stream } from "effect"
import {
  type OptionalAccess,
  OptionalPermissions,
  type PermissionChange,
} from "../optional-permissions"

export type PermissionAnswer = "Grant" | "Deny"

/**
 * テスト用。許可を求められたときのユーザーの答えを決め、他の画面で許可が増減する操作を起こす。
 * `FakeOptionalPermissions.layer` はこれと {@link OptionalPermissions} を、状態を共有させて提供する。
 * 最初はどの権限も許可されておらず、求められたら許可する。
 */
export class FakeOptionalPermissions extends Context.Service<
  FakeOptionalPermissions,
  {
    answerRequestsWith(answer: PermissionAnswer): Effect.Effect<void>
    grantElsewhere(access: OptionalAccess): Effect.Effect<void>
    revokeElsewhere(access: OptionalAccess): Effect.Effect<void>
    /** 求められた順に、求められた権限。 */
    readonly requested: Effect.Effect<ReadonlyArray<OptionalAccess>>
    /** 外された順に、外された権限。 */
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
