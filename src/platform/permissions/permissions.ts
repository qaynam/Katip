import { Context, Effect, Layer, Queue, Stream } from "effect"
import { BrowserApiError } from "#platform/browser"

export interface OriginPermissionChange {
  readonly kind: "granted" | "revoked"
  /** 変化したホストのマッチパターン（`https://example.com/*` の形）。 */
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
    /** `originPattern`（`https://example.com/*` の形）のホストへのアクセスが許可されているか。 */
    containsOrigin(originPattern: string): Effect.Effect<boolean, BrowserApiError>
    /**
     * `history` などの API の権限が許可されているか。
     *
     * 任意の権限は、許可されるまで `chrome.history` のような API の名前空間そのものが無い。
     */
    containsPermission(permission: string): Effect.Effect<boolean, BrowserApiError>
    /**
     * 購読を始めた後に、ホストへのアクセスの許可が増減したとき。
     *
     * @remarks
     * 購読したときにリスナーを登録するので、service worker を起こした許可の変化は届かない。
     * 許可を求めるのは開いているサイドパネルなので、その間 service worker は起きている。
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
