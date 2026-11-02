import { Option, pipe, Record, Schema } from "effect"
import type { HttpResponse } from "#platform/http"

const decodeNumber = Schema.decodeUnknownOption(Schema.FiniteFromString)

const headerNumber = (response: HttpResponse, name: string) =>
  Option.flatMap(Record.get(response.headers, name), decodeNumber)

const FALLBACK_WAIT_MS = 60_000

/**
 * For a response that hit GitHub's rate limit, returns when fetching again is allowed (epoch
 * milliseconds).
 *
 * None if the response isn't a rate-limit rejection. When the limit was hit without saying how long
 * to wait, it's one minute from `now`.
 *
 * @param now - What a wait given in seconds counts from.
 */
export const rateLimitRetryAt = (response: HttpResponse, now: number): Option.Option<number> => {
  if (response.status !== 403 && response.status !== 429) return Option.none()
  // The primary limit is reported as remaining requests plus a reset time (epoch seconds), the
  // secondary limit as retry-after (seconds)
  const afterRetryAfter = Option.map(
    headerNumber(response, "retry-after"),
    (seconds) => now + seconds * 1000,
  )
  const isExhausted = Option.contains(headerNumber(response, "x-ratelimit-remaining"), 0)
  const atReset = isExhausted
    ? Option.map(headerNumber(response, "x-ratelimit-reset"), (seconds) => seconds * 1000)
    : Option.none()
  return pipe(
    afterRetryAfter,
    Option.orElse(() => atReset),
    Option.orElse(() =>
      response.status === 429 || isExhausted ? Option.some(now + FALLBACK_WAIT_MS) : Option.none(),
    ),
  )
}
