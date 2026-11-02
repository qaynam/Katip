import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { FakePermissions } from "./fake-permissions"
import { Permissions } from "./permissions"

const GMAIL = "https://mail.google.com/*"
const GITHUB = "https://api.github.com/*"

describe("host access", () => {
  it.effect("no host is granted at first", () =>
    Effect.gen(function* () {
      const contains = yield* (yield* Permissions).containsOrigin(GMAIL)

      assert.isFalse(contains)
    }).pipe(Effect.provide(FakePermissions.layer)),
  )

  it.effect("only granted hosts are granted", () =>
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

  it.effect("a revoked host is no longer granted", () =>
    Effect.gen(function* () {
      const fake = yield* FakePermissions
      yield* fake.grant([GMAIL])

      yield* fake.revoke([GMAIL])

      assert.isFalse(yield* (yield* Permissions).containsOrigin(GMAIL))
    }).pipe(Effect.provide(FakePermissions.layer)),
  )
})

describe("access change notifications", () => {
  it.effect("carry only hosts whose access actually changed, in the order of the changes", () =>
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

describe("API permissions", () => {
  it.effect("only granted API permissions are granted", () =>
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

  it.effect("are kept apart from host access", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant(["history"])

      assert.isFalse(yield* (yield* Permissions).containsPermission("history"))
    }).pipe(Effect.provide(FakePermissions.layer)),
  )
})
