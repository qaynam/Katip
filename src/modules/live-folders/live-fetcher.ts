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

/** 取得元が応答しないまま待つ上限。超えたら接続できなかったものとして扱う。 */
export const FETCH_TIME_LIMIT: Duration.Input = "30 seconds"

const failWith = (failure: LiveFetchFailure) => Effect.fail(new LiveFetchError({ failure }))

const fromInterpretation = (result: Result.Result<ReadonlyArray<LiveItem>, LiveFetchFailure>) =>
  Effect.mapError(Effect.fromResult(result), (failure) => new LiveFetchError({ failure }))

export class LiveFetcher extends Context.Service<
  LiveFetcher,
  {
    /**
     * 取得元から、取得元が新しい順に並べた順で項目を取り込む。
     *
     * GitHub は、トークンが設定されていれば公式 API で、無ければブラウザのログイン中の
     * セッションで読む。
     *
     * 取得元へのアクセスが許可されていなければ、要求を送らずに失敗する。許可は求めない
     * （許可を求めるダイアログはユーザーの操作中のページからしか出せない）。
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
              Effect.as(Effect.logWarning("許可を確かめられなかった", error), false),
            ),
          )
        if (!isGranted) return yield* failWith({ _tag: "PermissionMissing" })
      })

      const loadToken = tokens.load.pipe(
        Effect.catch((error) =>
          Effect.as(Effect.logWarning("トークンを読めなかった", error), Option.none<string>()),
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

  /** {@link GitHubTokenStore} も合わせて提供する。 */
  static readonly layer = this.layerNoDeps.pipe(Layer.provideMerge(GitHubTokenStore.layer))
}
