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
 * For tests: stands in for {@link Http}, replying with registered responses and recording the
 * requests sent. `FakeHttp.layer` provides this and {@link Http} sharing the same state.
 */
export class FakeHttp extends Context.Service<
  FakeHttp,
  {
    /**
     * Answers requests whose URL starts with `urlPrefix` with `reply`; later routes win.
     * A request matching no route fails as if the server could not be reached.
     */
    route(urlPrefix: string, reply: FakeReply): Effect.Effect<void>
    /** The requests sent, in the order sent. */
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
