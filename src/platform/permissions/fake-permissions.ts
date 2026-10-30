import { Context, Effect, Layer, PubSub, Ref, Stream } from "effect"
import { Permissions, type OriginPermissionChange } from "./permissions"

/**
 * テスト用。ユーザーがホストへのアクセスを許可・取り消す操作を起こす。
 * `FakePermissions.layer` はこれと {@link Permissions} を、状態を共有させて提供する。
 * 最初はどのホストも許可されていない。
 */
export class FakePermissions extends Context.Service<
  FakePermissions,
  {
    grant(origins: ReadonlyArray<string>): Effect.Effect<void>
    revoke(origins: ReadonlyArray<string>): Effect.Effect<void>
  }
>()("katip/platform/permissions/FakePermissions") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const granted = yield* Ref.make<ReadonlySet<string>>(new Set())
      const changes = yield* PubSub.unbounded<OriginPermissionChange>()

      const announce = (change: OriginPermissionChange) =>
        change.origins.length === 0 ? Effect.void : PubSub.publish(changes, change)

      const grant = Effect.fnUntraced(function* (origins: ReadonlyArray<string>) {
        const before = yield* Ref.getAndUpdate(granted, (all) => new Set([...all, ...origins]))
        yield* announce({ kind: "granted", origins: origins.filter((o) => !before.has(o)) })
      })

      const revoke = Effect.fnUntraced(function* (origins: ReadonlyArray<string>) {
        const before = yield* Ref.getAndUpdate(
          granted,
          (all) => new Set([...all].filter((origin) => !origins.includes(origin))),
        )
        yield* announce({ kind: "revoked", origins: origins.filter((o) => before.has(o)) })
      })

      return Context.make(
        Permissions,
        Permissions.of({
          containsOrigin: (originPattern) =>
            Effect.map(Ref.get(granted), (all) => all.has(originPattern)),
          originChanges: Stream.fromPubSub(changes),
        }),
      ).pipe(Context.add(FakePermissions, FakePermissions.of({ grant, revoke })))
    }),
  )
}
