import { Option, Result, Schema } from "effect"
import { IdleMinutes } from "#modules/settings"
import { SpaceName } from "#modules/space"

const decodeSpaceName = Schema.decodeUnknownOption(SpaceName)

/** 空白だけの名前や、元と同じ名前では改名しない */
export const spaceNameChange = (draft: string, current: string): Option.Option<SpaceName> =>
  decodeSpaceName(draft).pipe(Option.filter((name) => name !== current))

/** 空の名前は「タブ名の上書きを解除する」意味の空文字として返す */
export const tabTitleChange = (draft: string, current: string): Option.Option<string> => {
  const title = draft.trim()
  return title === current ? Option.none() : Option.some(title)
}

/** ブックマークは空の名前にしない */
export const bookmarkTitleChange = (draft: string, current: string): Option.Option<string> => {
  const title = draft.trim()
  return title === "" || title === current ? Option.none() : Option.some(title)
}

const decodeIdleMinutes = Schema.decodeUnknownOption(IdleMinutes)

/** 受け付けられない入力は、その理由をユーザーに見せる文として返す */
export const idleMinutesFrom = (draft: string): Result.Result<IdleMinutes, string> => {
  const text = draft.trim()
  if (text === "") return Result.fail("分数を入力してください")
  const minutes = Number(text)
  if (!Number.isInteger(minutes)) return Result.fail("分は整数で入力してください")
  return Result.fromOption(decodeIdleMinutes(minutes), () => "1 分以上にしてください")
}
