import { Option, pipe, Record, Schema } from "effect"
import type { HttpResponse } from "#platform/http"

const decodeNumber = Schema.decodeUnknownOption(Schema.FiniteFromString)

const headerNumber = (response: HttpResponse, name: string) =>
  Option.flatMap(Record.get(response.headers, name), decodeNumber)

const FALLBACK_WAIT_MS = 60_000

/**
 * GitHub の利用上限に達した応答なら、取得し直してよい時刻（エポックミリ秒）を返す。
 *
 * 上限による拒否でなければ None。待つ時間を知らされずに上限に達したなら、1 分後とする。
 *
 * @param now - 待ち時間（秒）で知らされたときの起点。
 */
export const rateLimitRetryAt = (response: HttpResponse, now: number): Option.Option<number> => {
  if (response.status !== 403 && response.status !== 429) return Option.none()
  // 一次の上限は残り回数と回復時刻（エポック秒）、二次の上限は retry-after（秒）で知らされる
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
