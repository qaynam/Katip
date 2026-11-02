import { Clock, Context, type Duration, Effect, Layer, Match, Option, type Result } from "effect"
import { Http, type HttpRequest, type HttpResponse } from "#platform/http"
import { Permissions } from "#platform/permissions"
import {
  GITHUB_API_ORIGIN,
  githubApiItemsFrom,
  githubApiSearchesFor,
  githubApiSearchRequest,
} from "./github-api-search"
import { GitHubTokenStore } from "./github-token-store"
import {
  githubWebItemsFrom,
  githubWebSearchesFor,
  githubWebSearchRequest,
} from "./github-web-search"
import { gmailFeedRequest, gmailItemsFrom } from "./gmail-feed"
import { LiveFetchError, type LiveFetchFailure } from "./live-fetch-failure"
import { mergeNewestFirst } from "./live-item-order"
import { originPatternOf, type LiveItem, type LiveSource } from "./live-source"

/** How long to wait for a source to answer. Past this, it's treated as unreachable. */
export const FETCH_TIME_LIMIT: Duration.Input = "30 seconds"

const failWith = (failure: LiveFetchFailure) => Effect.fail(new LiveFetchError({ failure }))

const fromInterpretation = (result: Result.Result<ReadonlyArray<LiveItem>, LiveFetchFailure>) =>
  Effect.mapError(Effect.fromResult(result), (failure) => new LiveFetchError({ failure }))

export class LiveFetcher extends Context.Service<
  LiveFetcher,
  {
    /**
     * Takes in items from the source, in the source's newest-first order.
     *
     * GitHub is read through the official API when a token is set, and otherwise with the
     * browser's signed-in session.
     *
     * Fails without sending a request when access to the source isn't granted. Never asks for the
     * permission (the dialog asking for it can only come from a page the user is acting on).
     */
    fetch(source: LiveSource): Effect.Effect<ReadonlyArray<LiveItem>, LiveFetchError>
  }
>()("katip/live-folders/LiveFetcher") {
  static readonly layerNoDeps = Layer.effect(
    LiveFetcher,
    Effect.gen(function* () {
      const http = yield* Http
      const permissions = yield* Permissions
      const tokens = yield* GitHubTokenStore

      const send = (request: HttpRequest): Effect.Effect<HttpResponse, LiveFetchError> =>
        http.send(request).pipe(
          Effect.timeout(FETCH_TIME_LIMIT),
          Effect.catch(() => failWith({ _tag: "Unreachable" })),
        )

      const requirePermission = Effect.fnUntraced(function* (originPattern: string) {
        const isGranted = yield* permissions
          .containsOrigin(originPattern)
          .pipe(
            Effect.catch((error) =>
              Effect.as(Effect.logWarning("Couldn't check the permission", error), false),
            ),
          )
        if (!isGranted) return yield* failWith({ _tag: "PermissionMissing" })
      })

      const loadToken = tokens.load.pipe(
        Effect.catch((error) =>
          Effect.as(Effect.logWarning("Couldn't read the token", error), Option.none<string>()),
        ),
      )

      const fetchGitHubWithToken = Effect.fnUntraced(function* (
        source: Extract<LiveSource, { _tag: "GitHub" }>,
        token: string,
      ) {
        yield* requirePermission(GITHUB_API_ORIGIN)
        const results = yield* Effect.forEach(githubApiSearchesFor(source.query), (search) =>
          Effect.flatMap(send(githubApiSearchRequest(search, token)), (response) =>
            Effect.flatMap(Clock.currentTimeMillis, (now) =>
              fromInterpretation(githubApiItemsFrom(response, now)),
            ),
          ),
        )
        return mergeNewestFirst(results)
      })

      const fetchGitHubWithSession = Effect.fnUntraced(function* (
        source: Extract<LiveSource, { _tag: "GitHub" }>,
      ) {
        yield* requirePermission(originPatternOf(source))
        const results = yield* Effect.forEach(githubWebSearchesFor(source.query), (search) =>
          Effect.flatMap(send(githubWebSearchRequest(search)), (response) =>
            Effect.flatMap(Clock.currentTimeMillis, (now) =>
              fromInterpretation(githubWebItemsFrom(response, search, now)),
            ),
          ),
        )
        return mergeNewestFirst(results)
      })

      const fetchGitHub = (source: Extract<LiveSource, { _tag: "GitHub" }>) =>
        Effect.flatMap(
          loadToken,
          Option.match({
            onNone: () => fetchGitHubWithSession(source),
            onSome: (token) => fetchGitHubWithToken(source, token),
          }),
        )

      const fetchGmail = Effect.fnUntraced(function* (
        source: Extract<LiveSource, { _tag: "Gmail" }>,
      ) {
        yield* requirePermission(originPatternOf(source))
        const response = yield* send(gmailFeedRequest(source))
        return yield* fromInterpretation(gmailItemsFrom(response, source))
      })

      return LiveFetcher.of({
        fetch: Effect.fn("LiveFetcher.fetch")(function* (source) {
          return yield* Match.valueTags(source, { Gmail: fetchGmail, GitHub: fetchGitHub })
        }),
      })
    }),
  )

  /** Also provides {@link GitHubTokenStore}. */
  static readonly layer = this.layerNoDeps.pipe(Layer.provideMerge(GitHubTokenStore.layer))
}
