import { Option, Schema } from "effect"
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
