import { Context, Effect, Layer } from "effect"
import { BrowserApiError } from "#platform/browser"
import { shortcutAsShown } from "./suggested-keys"

const callChrome = <A>(api: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new BrowserApiError({ api, cause }) })

const isMac = Effect.map(
  callChrome("runtime.getPlatformInfo", () => chrome.runtime.getPlatformInfo()),
  ({ os }) => os === "mac",
)

export class KeyboardShortcuts extends Context.Service<
  KeyboardShortcuts,
  {
    /**
     * The keys currently assigned to each manifest command, keyed by command name and written the
     * way the browser shows them (such as ⇧⌘C on a Mac). Commands without keys are left out.
     */
    readonly assigned: Effect.Effect<ReadonlyMap<string, string>, BrowserApiError>
    /**
     * The keys the manifest suggests for this system, keyed by command name and written the way
     * {@link assigned} writes keys. Chrome assigns one only if nothing else holds it already.
     */
    readonly suggested: Effect.Effect<ReadonlyMap<string, string>, BrowserApiError>
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
      isMac,
      suggested: Effect.map(isMac, (mac) => {
        const commands = Object.entries(chrome.runtime.getManifest().commands ?? {})
        return new Map(
          commands.flatMap(([name, { suggested_key: suggestion }]) => {
            const key =
              typeof suggestion === "string"
                ? suggestion
                : mac
                  ? (suggestion?.mac ?? suggestion?.default)
                  : suggestion?.default
            return key === undefined ? [] : [[name, shortcutAsShown(key, mac)] as const]
          }),
        )
      }),
    }),
  )

  /** For tests: fixed assignments, suggestions and OS. */
  static readonly layerTest = (options: {
    readonly assigned?: Readonly<Record<string, string>>
    readonly suggested?: Readonly<Record<string, string>>
    readonly isMac?: boolean
  }) =>
    Layer.succeed(
      KeyboardShortcuts,
      KeyboardShortcuts.of({
        assigned: Effect.succeed(new Map(Object.entries(options.assigned ?? {}))),
        suggested: Effect.succeed(new Map(Object.entries(options.suggested ?? {}))),
        isMac: Effect.succeed(options.isMac ?? false),
      }),
    )
}
