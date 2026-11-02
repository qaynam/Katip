import { Context, Effect, Layer, Queue, Stream } from "effect"
import { BrowserApiError } from "#platform/browser"

/** Permissions the manifest marks optional, which the settings page asks for and removes. */
export type OptionalAccess = "History"

export type PermissionChange = "Added" | "Removed"

const permissionsOf: Readonly<Record<OptionalAccess, chrome.permissions.Permissions>> = {
  History: { permissions: ["history"] },
}

const callPermissions = (api: string, call: () => Promise<boolean>) =>
  Effect.tryPromise({ try: call, catch: (cause) => new BrowserApiError({ api, cause }) })

const changesFrom = (event: typeof chrome.permissions.onAdded, change: PermissionChange) =>
  Stream.callback<PermissionChange>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const listener = () => Queue.offerUnsafe(queue, change)
        event.addListener(listener)
        return listener
      }),
      (listener) => Effect.sync(() => event.removeListener(listener)),
    ),
  )

export class OptionalPermissions extends Context.Service<
  OptionalPermissions,
  {
    contains(access: OptionalAccess): Effect.Effect<boolean, BrowserApiError>
    /**
     * Asks for the permission and returns whether it was granted. Returns true without asking when
     * it's already granted.
     *
     * @remarks
     * Chrome asks only while it's handling a user gesture such as a click. Run this inside the
     * gesture's handler without awaiting anything else first.
     */
    request(access: OptionalAccess): Effect.Effect<boolean, BrowserApiError>
    /** Returns whether the permission was removed. */
    remove(access: OptionalAccess): Effect.Effect<boolean, BrowserApiError>
    /** Emits whenever any permission is granted or removed while subscribed, from any page. */
    readonly changes: Stream.Stream<PermissionChange>
  }
>()("katip/options/OptionalPermissions") {
  // Not Layer.succeed: it would read chrome.permissions on import and break tests that have no chrome
  static readonly layer = Layer.sync(OptionalPermissions, () =>
    OptionalPermissions.of({
      contains: (access) =>
        callPermissions("permissions.contains", () =>
          chrome.permissions.contains(permissionsOf[access]),
        ),
      request: (access) =>
        callPermissions("permissions.request", () =>
          chrome.permissions.request(permissionsOf[access]),
        ),
      remove: (access) =>
        callPermissions("permissions.remove", () =>
          chrome.permissions.remove(permissionsOf[access]),
        ),
      changes: Stream.merge(
        changesFrom(chrome.permissions.onAdded, "Added"),
        changesFrom(chrome.permissions.onRemoved, "Removed"),
      ),
    }),
  )
}
