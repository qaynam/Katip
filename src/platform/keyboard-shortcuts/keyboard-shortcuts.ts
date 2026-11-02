import { Context, Effect, Layer } from "effect"
import { BrowserApiError } from "#platform/browser"

const callChrome = <A>(api: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new BrowserApiError({ api, cause }) })

export class KeyboardShortcuts extends Context.Service<
  KeyboardShortcuts,
  {
    /**
     * The keys currently assigned to each manifest command, keyed by command name and written the
     * way the browser shows them (such as ⇧⌘C on a Mac). Commands without keys are left out.
     */
    readonly assigned: Effect.Effect<ReadonlyMap<string, string>, BrowserApiError>
    /** Whether the browser runs on macOS. */
    readonly isMac: Effect.Effect<boolean, BrowserApiError>
  }
>()("katip/platform/keyboard-shortcuts/KeyboardShortcuts") {
  static readonly layer = Layer.succeed(
    KeyboardShortcuts,
    KeyboardShortcuts.of({
      assigned: Effect.map(
        callChrome("commands.getAll", () => chrome.commands.getAll()),
        (commands) =>
          new Map(
            commands.flatMap(({ name, shortcut }) =>
              name !== undefined && shortcut !== undefined && shortcut !== ""
                ? [[name, shortcut] as const]
                : [],
            ),
          ),
      ),
      isMac: Effect.map(
        callChrome("runtime.getPlatformInfo", () => chrome.runtime.getPlatformInfo()),
        ({ os }) => os === "mac",
      ),
    }),
  )

  /** For tests: fixed assignments and OS. */
  static readonly layerTest = (options: {
    readonly assigned?: Readonly<Record<string, string>>
    readonly isMac?: boolean
  }) =>
    Layer.succeed(
      KeyboardShortcuts,
      KeyboardShortcuts.of({
        assigned: Effect.succeed(new Map(Object.entries(options.assigned ?? {}))),
        isMac: Effect.succeed(options.isMac ?? false),
      }),
    )
}
