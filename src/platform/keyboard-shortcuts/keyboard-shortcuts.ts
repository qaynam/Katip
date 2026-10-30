import { Context, Effect, Layer } from "effect"
import { BrowserApiError } from "#platform/browser"

const callChrome = <A>(api: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new BrowserApiError({ api, cause }) })

export class KeyboardShortcuts extends Context.Service<
  KeyboardShortcuts,
  {
    /**
     * マニフェストのコマンドの名前ごとに、今割り当てられているキーの書き方（Mac なら「⇧⌘C」など）。
     * キーを割り当てていないコマンドは含まない。
     */
    readonly assigned: Effect.Effect<ReadonlyMap<string, string>, BrowserApiError>
    /** ブラウザが macOS で動いているか。キーの書き方を OS に合わせるのに使う。 */
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

  /** テスト用。割り当てと OS を決めて返す。 */
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
