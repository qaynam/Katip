import { Context, Effect, Layer } from "effect"
import { BrowserApiError } from "#platform/browser"

/** A notification as the system shows it, with the extension's icon. */
export interface SystemNotification {
  readonly title: string
  readonly message: string
  /** Shown in a lighter type, such as where the notification comes from. */
  readonly contextMessage: string
}

const callNotifications = <A>(api: string, call: () => Promise<A>) =>
  Effect.tryPromise({ try: call, catch: (cause) => new BrowserApiError({ api, cause }) })

const extensionIconUrl = Effect.suspend(() =>
  Effect.fromNullishOr(chrome.runtime.getManifest().icons?.[128]),
).pipe(
  Effect.mapError(
    () =>
      new BrowserApiError({
        api: "runtime.getManifest",
        cause: new Error("the manifest has no 128px icon"),
      }),
  ),
)

export class Notifications extends Context.Service<
  Notifications,
  {
    /**
     * Shows a notification, replacing the one shown with the same id if it's still there.
     *
     * Fails without the `notifications` permission; check it first with `#platform/permissions`.
     * A click on it arrives as a `NotificationClicked` browser event carrying the id.
     */
    show(id: string, notification: SystemNotification): Effect.Effect<void, BrowserApiError>
    /** Does nothing when no notification with the id is shown. */
    clear(id: string): Effect.Effect<void, BrowserApiError>
  }
>()("katip/platform/notifications/Notifications") {
  // chrome.notifications is not read until used: it does not exist at all without the permission
  static readonly layer = Layer.succeed(
    Notifications,
    Notifications.of({
      show: Effect.fnUntraced(function* (id, notification) {
        const iconUrl = yield* extensionIconUrl
        yield* callNotifications("notifications.create", () =>
          chrome.notifications.create(id, { type: "basic", iconUrl, ...notification }),
        )
      }),
      clear: (id) =>
        Effect.asVoid(
          callNotifications("notifications.clear", () => chrome.notifications.clear(id)),
        ),
    }),
  )
}
