import { Context, Effect, Layer, Option, Schema } from "effect"
import { Storage, type BrowserApiError } from "#platform/browser"

const TOKEN_KEY = "katip/live-folders/github-token"

/**
 * The GitHub personal access token.
 *
 * @remarks
 * Kept in local storage and never put in the view sent to the side panel. In sync storage it would
 * be copied to every device the Google account syncs to, and in the view any page of the extension
 * could read it.
 */
export class GitHubTokenStore extends Context.Service<
  GitHubTokenStore,
  {
    readonly load: Effect.Effect<Option.Option<string>, BrowserApiError>
    /** Saves the token without surrounding whitespace. An empty token removes the saved one. */
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
