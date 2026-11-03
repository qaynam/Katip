import { Effect, Option, Schema } from "effect"

export class BrowserApiError extends Schema.TaggedError<BrowserApiError>()("BrowserApiError", {
  api: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const reason = this.cause instanceof Error ? this.cause.message : String(this.cause)
    return `${this.api}: ${reason}`
  }
}

export const callChrome = <A>(
  api: string,
  run: () => Promise<A>,
): Effect.Effect<A, BrowserApiError> =>
  Effect.tryPromise({ try: run, catch: (cause) => new BrowserApiError({ api, cause }) })

export const requirePresent =
  (api: string, missing: string) =>
  <A>(value: Option.Option<A>): Effect.Effect<A, BrowserApiError> =>
    Option.match(value, {
      onNone: () => Effect.fail(new BrowserApiError({ api, cause: new Error(missing) })),
      onSome: Effect.succeed,
    })
