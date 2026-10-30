import { Clock, Context, type Duration, Effect, Layer, Match, Option, type Result } from "effect"
import { Http, type HttpRequest, type HttpResponse } from "#platform/http"
import { Permissions } from "#platform/permissions"
import {
  githubItemsFrom,
  githubSearchesFor,
  githubSearchRequest,
  mergeSearchResults,
} from "./github-search"
import { GitHubTokenStore } from "./github-token-store"
import { gmailFeedRequest, gmailItemsFrom } from "./gmail-feed"
import { LiveFetchError, type LiveFetchFailure } from "./live-fetch-failure"
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
     * 取得元から項目を取り込む。
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

      const requirePermission = Effect.fnUntraced(function* (source: LiveSource) {
        const isGranted = yield* permissions
          .containsOrigin(originPatternOf(source))
          .pipe(
            Effect.catch((error) =>
              Effect.as(Effect.logWarning("許可を確かめられなかった", error), false),
            ),
          )
        if (!isGranted) return yield* failWith({ _tag: "PermissionMissing" })
      })

      const requireToken = tokens.load.pipe(
        Effect.catch((error) =>
          Effect.as(Effect.logWarning("トークンを読めなかった", error), Option.none<string>()),
        ),
        Effect.flatMap(
          Option.match({
            onNone: () => failWith({ _tag: "TokenMissing" }),
            onSome: Effect.succeed,
          }),
        ),
      )

      const fetchGitHub = Effect.fnUntraced(function* (
        source: Extract<LiveSource, { _tag: "GitHub" }>,
      ) {
        const token = yield* requireToken
        const results = yield* Effect.forEach(githubSearchesFor(source.query), (search) =>
          Effect.flatMap(send(githubSearchRequest(search, token)), (response) =>
            Effect.flatMap(Clock.currentTimeMillis, (now) =>
              fromInterpretation(githubItemsFrom(response, now)),
            ),
          ),
        )
        return mergeSearchResults(results)
      })

      const fetchGmail = (source: Extract<LiveSource, { _tag: "Gmail" }>) =>
        Effect.flatMap(send(gmailFeedRequest(source)), (response) =>
          fromInterpretation(gmailItemsFrom(response, source)),
        )

      return LiveFetcher.of({
        fetch: Effect.fn("LiveFetcher.fetch")(function* (source) {
          yield* requirePermission(source)
          return yield* Match.valueTags(source, { Gmail: fetchGmail, GitHub: fetchGitHub })
        }),
      })
    }),
  )

  /** {@link GitHubTokenStore} も合わせて提供する。 */
  static readonly layer = this.layerNoDeps.pipe(Layer.provideMerge(GitHubTokenStore.layer))
}
