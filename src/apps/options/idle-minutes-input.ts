import { Result, Schema } from "effect"
import { IdleMinutes } from "#modules/settings"

const decodeIdleMinutes = Schema.decodeUnknownResult(IdleMinutes)

/** 入力欄の文字列を検証する。失敗時は利用者に見せる理由を返す。 */
export const parseIdleMinutesInput = (text: string): Result.Result<IdleMinutes, string> => {
  const trimmed = text.trim()
  if (trimmed === "") {
    return Result.fail("時間を分単位で入力してください")
  }
  return Result.mapError(decodeIdleMinutes(Number(trimmed)), () => "1 以上の整数で入力してください")
}
