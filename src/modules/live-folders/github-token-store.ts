import { Context, Effect, Layer, Option, Schema } from "effect"
import { Storage, type BrowserApiError } from "#platform/browser"

const TOKEN_KEY = "katip/live-folders/github-token"

/**
 * GitHub の個人アクセストークン。
 *
 * @remarks
 * local に置き、サイドパネルへ送るビューにも載せない。sync に置くと Google アカウントの
 * 同期先すべてに複製され、ビューに載せると拡張のどのページからでも読めてしまうため。
 */
export class GitHubTokenStore extends Context.Service<
  GitHubTokenStore,
  {
    readonly load: Effect.Effect<Option.Option<string>, BrowserApiError>
    /** 前後の空白を除いて保存する。空なら保存してあるトークンを消す。 */
    save(token: string): Effect.Effect<void, BrowserApiError>
  }
>()("katip/live-folders/GitHubTokenStore") {
  static readonly layer = Layer.effect(
    GitHubTokenStore,
    Effect.gen(function* () {
      const { local } = yield* Storage
      return GitHubTokenStore.of({
        load: local
          .getDecoded(TOKEN_KEY, Schema.NonEmptyString)
          .pipe(Effect.catchTag("StorageDecodeError", () => Effect.succeedNone)),
        save: (token) => {
          const trimmed = token.trim()
          return trimmed === "" ? local.remove(TOKEN_KEY) : local.set(TOKEN_KEY, trimmed)
        },
      })
    }),
  )
}
