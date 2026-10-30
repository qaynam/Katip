import { Context, Effect, Layer, Queue, Stream } from "effect"
import { BrowserApiError } from "#platform/browser"

/** 設定画面から求めたり外したりする、マニフェストで任意にしている権限。 */
export type OptionalAccess = "AllSites" | "History"

export type PermissionChange = "Added" | "Removed"

const permissionsOf: Readonly<Record<OptionalAccess, chrome.permissions.Permissions>> = {
  AllSites: { origins: ["*://*/*"] },
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
     * 許可を求め、許可されたかを返す。許可済みなら尋ねずに true を返す。
     *
     * @remarks
     * Chrome はクリックなどの操作を処理している間しか尋ねない。操作のハンドラの中で、
     * 先に別の非同期の処理を待たずに実行すること。
     */
    request(access: OptionalAccess): Effect.Effect<boolean, BrowserApiError>
    /** 外せたかを返す。 */
    remove(access: OptionalAccess): Effect.Effect<boolean, BrowserApiError>
    /** 購読している間に、いずれかの権限の許可が増減するたびに流れる。他の画面での変化も流れる。 */
    readonly changes: Stream.Stream<PermissionChange>
  }
>()("katip/options/OptionalPermissions") {
  // Layer.succeed だと import した時点で chrome.permissions を読み、chrome の無いテストが落ちる
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
