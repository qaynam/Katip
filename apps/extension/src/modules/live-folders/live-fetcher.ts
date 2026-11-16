import { Clock, Context, type Duration, Effect, Layer, Match, Option, type Result } from "effect"
import { Http, type HttpRequest, type HttpResponse } from "#platform/http"
import { Permissions } from "#platform/permissions"
import {
  githubApiItemsFrom,
  githubApiSearchesFor,
  githubApiSearchRequest,
} from "./github-api-search"
import { GITHUB_NOTIFICATIONS_REQUEST, githubNotificationItemsFrom } from "./github-notifications"
import { GitHubTokenStore } from "./github-token-store"
import {
  githubWebItemsFrom,
  githubWebSearchesFor,
  githubWebSearchRequest,
} from "./github-web-search"
import { gmailFeedRequest, gmailItemsFrom, markImportant } from "./gmail-feed"
import { LiveFetchError, type LiveFetchFailure } from "./live-fetch-failure"
import { mergeNewestFirst } from "./live-item-order"
import {
  GITHUB_API_ORIGIN,
  GITHUB_WEB_ORIGIN,
  GMAIL_IMPORTANT_LABEL,
  originPatternOf,
  type GitHubSearchQuery,
  type LiveItem,
  type LiveSource,
} from "./live-source"

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
     * GitHub's searches are read through the official API when a token is set, and otherwise with
     * the browser's signed-in session. GitHub's notifications are always read with the signed-in
     * session.
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

      const searchGitHubWithToken = Effect.fnUntraced(function* (
        query: GitHubSearchQuery,
        token: string,
      ) {
        yield* requirePermission(GITHUB_API_ORIGIN)
        const results = yield* Effect.forEach(githubApiSearchesFor(query), (search) =>
          Effect.flatMap(send(githubApiSearchRequest(search, token)), (response) =>
            Effect.flatMap(Clock.currentTimeMillis, (now) =>
              fromInterpretation(githubApiItemsFrom(response, now)),
            ),
          ),
        )
        return mergeNewestFirst(results)
      })

      const searchGitHubWithSession = Effect.fnUntraced(function* (query: GitHubSearchQuery) {
        yield* requirePermission(GITHUB_WEB_ORIGIN)
        const results = yield* Effect.forEach(githubWebSearchesFor(query), (search) =>
          Effect.flatMap(send(githubWebSearchRequest(search)), (response) =>
            Effect.flatMap(Clock.currentTimeMillis, (now) =>
              fromInterpretation(githubWebItemsFrom(response, search, now)),
            ),
          ),
        )
        return mergeNewestFirst(results)
      })

      const fetchGitHubNotifications = Effect.fnUntraced(function* () {
        yield* requirePermission(GITHUB_WEB_ORIGIN)
        const response = yield* send(GITHUB_NOTIFICATIONS_REQUEST)
        const now = yield* Clock.currentTimeMillis
        return yield* fromInterpretation(githubNotificationItemsFrom(response, now))
      })

      const fetchGitHub = ({ query }: Extract<LiveSource, { _tag: "GitHub" }>) =>
        query === "notifications"
          ? fetchGitHubNotifications()
          : Effect.flatMap(
              loadToken,
              Option.match({
                onNone: () => searchGitHubWithSession(query),
                onSome: (token) => searchGitHubWithToken(query, token),
              }),
            )

      const fetchGmailFeed = (source: Extract<LiveSource, { _tag: "Gmail" }>) =>
        Effect.flatMap(send(gmailFeedRequest(source)), (response) =>
          fromInterpretation(gmailItemsFrom(response, source)),
        )

      const fetchGmail = Effect.fnUntraced(function* (
        source: Extract<LiveSource, { _tag: "Gmail" }>,
      ) {
        yield* requirePermission(originPatternOf(source))
        const [items, important] = yield* Effect.all(
          [
            fetchGmailFeed(source),
            // Not failing the folder with it: without it the folder still lists its mail, unmarked
            fetchGmailFeed({ ...source, label: GMAIL_IMPORTANT_LABEL }).pipe(
              Effect.catch(() => Effect.succeed<ReadonlyArray<LiveItem>>([])),
            ),
          ],
          { concurrency: 2 },
        )
        return markImportant(items, important)
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
