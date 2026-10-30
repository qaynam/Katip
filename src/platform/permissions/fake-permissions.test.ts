import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { FakePermissions } from "./fake-permissions"
import { Permissions } from "./permissions"

const GMAIL = "https://mail.google.com/*"
const GITHUB = "https://api.github.com/*"

describe("ホストへのアクセスの許可", () => {
  it.effect("最初はどのホストも許可されていない", () =>
    Effect.gen(function* () {
      const contains = yield* (yield* Permissions).containsOrigin(GMAIL)

      assert.isFalse(contains)
    }).pipe(Effect.provide(FakePermissions.layer)),
  )

  it.effect("許可したホストだけが許可されている", () =>
    Effect.gen(function* () {
      const permissions = yield* Permissions
      yield* (yield* FakePermissions).grant([GMAIL])

      const contains = [
        yield* permissions.containsOrigin(GMAIL),
        yield* permissions.containsOrigin(GITHUB),
      ]

      assert.deepStrictEqual(contains, [true, false])
    }).pipe(Effect.provide(FakePermissions.layer)),
  )

  it.effect("取り消したホストは許可されていない", () =>
    Effect.gen(function* () {
      const fake = yield* FakePermissions
      yield* fake.grant([GMAIL])

      yield* fake.revoke([GMAIL])

      assert.isFalse(yield* (yield* Permissions).containsOrigin(GMAIL))
    }).pipe(Effect.provide(FakePermissions.layer)),
  )
})

describe("許可の変化の通知", () => {
  it.effect("実際に許可が増減したホストだけが、増減の順に流れる", () =>
    Effect.gen(function* () {
      const fake = yield* FakePermissions
      yield* fake.grant([GMAIL])
      const collecting = yield* (yield* Permissions).originChanges.pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      yield* fake.grant([GMAIL, GITHUB])
      yield* fake.revoke([GMAIL])
      const changes = yield* Fiber.join(collecting)

      assert.deepStrictEqual(Array.from(changes), [
        { kind: "granted", origins: [GITHUB] },
        { kind: "revoked", origins: [GMAIL] },
      ])
    }).pipe(Effect.provide(FakePermissions.layer)),
  )
})

describe("API の権限", () => {
  it.effect("許可した API の権限だけが許可されている", () =>
    Effect.gen(function* () {
      const permissions = yield* Permissions
      yield* (yield* FakePermissions).grantPermissions(["history"])

      const contains = [
        yield* permissions.containsPermission("history"),
        yield* permissions.containsPermission("downloads"),
      ]

      assert.deepStrictEqual(contains, [true, false])
    }).pipe(Effect.provide(FakePermissions.layer)),
  )

  it.effect("ホストへのアクセスの許可とは別に扱う", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant(["history"])

      assert.isFalse(yield* (yield* Permissions).containsPermission("history"))
    }).pipe(Effect.provide(FakePermissions.layer)),
  )
})
