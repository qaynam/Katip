import { Context, Effect, Layer, Schema } from "effect"

export interface HttpRequest {
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  /** `include` sends the browser's cookies for the destination site. */
  readonly credentials: "include" | "omit"
  /**
   * `manual` does not follow redirects and returns a response whose
   * {@link HttpResponse.isRedirect} is true.
   */
  readonly redirect?: "follow" | "manual"
}

export interface HttpResponse {
  /** 0 for a redirect that was not followed. */
  readonly status: number
  readonly isRedirect: boolean
  /** Header names are lowercase. */
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

/**
 * No response arrived (offline, DNS, CORS, aborted and so on). An HTTP error response is not this
 * error.
 */
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
