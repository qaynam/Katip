import { Array, Context, Effect, Layer, Option, Ref } from "effect"
import { Http, HttpRequestError, type HttpRequest, type HttpResponse } from "./http"

export type FakeReply = (request: HttpRequest) => Effect.Effect<HttpResponse, HttpRequestError>

interface Route {
  readonly urlPrefix: string
  readonly reply: FakeReply
}

export const httpResponse = (
  status: number,
  body = "",
  headers: Readonly<Record<string, string>> = {},
): HttpResponse => ({ status, isRedirect: false, headers, body })

export const redirectResponse: HttpResponse = {
  status: 0,
  isRedirect: true,
  headers: {},
  body: "",
}

export const unreachable: FakeReply = (request) =>
  Effect.fail(new HttpRequestError({ url: request.url, cause: new Error("unreachable (fake)") }))

/**
 * テスト用。{@link Http} の代わりに、登録した応答を返して送られた要求を記録する。
 * `FakeHttp.layer` はこれと {@link Http} を、状態を共有させて提供する。
 */
export class FakeHttp extends Context.Service<
  FakeHttp,
  {
    /**
     * URL が `urlPrefix` で始まる要求に `reply` で応える。後から登録したものほど優先する。
     * どの登録にも当たらない要求は接続できなかったものとして失敗する。
     */
    route(urlPrefix: string, reply: FakeReply): Effect.Effect<void>
    /** 送られた要求を、送られた順に返す。 */
    readonly requests: Effect.Effect<ReadonlyArray<HttpRequest>>
  }
>()("katip/platform/http/FakeHttp") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const routes = yield* Ref.make<ReadonlyArray<Route>>([])
      const requests = yield* Ref.make<ReadonlyArray<HttpRequest>>([])

      const send = (request: HttpRequest) =>
        Effect.gen(function* () {
          yield* Ref.update(requests, (all) => [...all, request])
          const route = Array.findLast(yield* Ref.get(routes), (candidate) =>
            request.url.startsWith(candidate.urlPrefix),
          )
          return yield* Option.match(route, {
            onNone: () => unreachable(request),
            onSome: ({ reply }) => reply(request),
          })
        })

      return Context.make(Http, Http.of({ send })).pipe(
        Context.add(
          FakeHttp,
          FakeHttp.of({
            route: (urlPrefix, reply) =>
              Ref.update(routes, (all) => [...all, { urlPrefix, reply }]),
            requests: Ref.get(requests),
          }),
        ),
      )
    }),
  )
}
