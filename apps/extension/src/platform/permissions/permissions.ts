import { Context, Effect, Layer, Queue, Stream } from "effect"
import { BrowserApiError } from "#platform/browser"

export interface OriginPermissionChange {
  readonly kind: "granted" | "revoked"
  /** Match patterns of the hosts that changed, shaped like `https://example.com/*`. */
  readonly origins: ReadonlyArray<string>
}

type ChromePermissionEvent = typeof chrome.permissions.onAdded

const changesFrom = (event: ChromePermissionEvent, kind: OriginPermissionChange["kind"]) =>
  Stream.callback<OriginPermissionChange>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const listener = ({ origins }: chrome.permissions.Permissions) => {
          if (origins !== undefined && origins.length > 0) {
            Queue.offerUnsafe(queue, { kind, origins })
          }
        }
        event.addListener(listener)
        return listener
      }),
      (listener) => Effect.sync(() => event.removeListener(listener)),
    ),
  )

export class Permissions extends Context.Service<
  Permissions,
  {
    /** Whether access is granted to the hosts of `originPattern`, like `https://example.com/*`. */
    containsOrigin(originPattern: string): Effect.Effect<boolean, BrowserApiError>
    /**
     * Whether an API permission such as `history` is granted.
     *
     * Until an optional permission is granted, its API namespace, such as `chrome.history`, does
     * not exist at all.
     */
    containsPermission(permission: string): Effect.Effect<boolean, BrowserApiError>
    /**
     * Host access grants and revocations after subscribing.
     *
     * @remarks
     * The listener is registered on subscription, so a change that woke the service worker is not
     * delivered. That is acceptable because permissions are requested from an open side panel,
     * which keeps the service worker awake.
     */
    readonly originChanges: Stream.Stream<OriginPermissionChange>
  }
>()("katip/platform/permissions/Permissions") {
  static readonly layer = Layer.sync(Permissions, () =>
    Permissions.of({
      containsOrigin: (originPattern) =>
        Effect.tryPromise({
          try: () => chrome.permissions.contains({ origins: [originPattern] }),
          catch: (cause) => new BrowserApiError({ api: "permissions.contains", cause }),
        }),
      containsPermission: (permission) =>
        Effect.tryPromise({
          try: () =>
            chrome.permissions.contains({
              permissions: [permission as chrome.runtime.ManifestPermission],
            }),
          catch: (cause) => new BrowserApiError({ api: "permissions.contains", cause }),
        }),
      originChanges: Stream.merge(
        changesFrom(chrome.permissions.onAdded, "granted"),
        changesFrom(chrome.permissions.onRemoved, "revoked"),
      ),
    }),
  )
}
