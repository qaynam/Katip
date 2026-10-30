import { Context, Effect, Layer, Schema } from "effect"

export interface HttpRequest {
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  /** `include` はブラウザが持つ送信先のサイトの cookie を付けて送る。 */
  readonly credentials: "include" | "omit"
  /** `manual` ではリダイレクトをたどらず、{@link HttpResponse.isRedirect} が真の応答を返す。 */
  readonly redirect?: "follow" | "manual"
}

export interface HttpResponse {
  /** たどらなかったリダイレクトでは 0。 */
  readonly status: number
  readonly isRedirect: boolean
  /** ヘッダー名は小文字。 */
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

/** 応答を受け取れなかった（オフライン、DNS、CORS、中断など）。HTTP のエラー応答はこれにならない。 */
export class HttpRequestError extends Schema.TaggedError<HttpRequestError>()("HttpRequestError", {
  url: Schema.String,
  cause: Schema.Defect(),
}) {}

const toHttpResponse = async (response: Response): Promise<HttpResponse> => ({
  status: response.status,
  isRedirect: response.type === "opaqueredirect",
  headers: Object.fromEntries(response.headers.entries()),
  body: await response.text(),
})

export class Http extends Context.Service<
  Http,
  { send(request: HttpRequest): Effect.Effect<HttpResponse, HttpRequestError> }
>()("katip/platform/http/Http") {
  static readonly layer = Layer.succeed(
    Http,
    Http.of({
      send: (request) =>
        Effect.tryPromise({
          try: (signal) =>
            fetch(request.url, {
              headers: request.headers ?? {},
              credentials: request.credentials,
              redirect: request.redirect ?? "follow",
              signal,
            }).then(toHttpResponse),
          catch: (cause) => new HttpRequestError({ url: request.url, cause }),
        }),
    }),
  )
}
