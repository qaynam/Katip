import { Option, Schema } from "effect"
import { SpaceName } from "#modules/space"

const decodeSpaceName = Schema.decodeUnknownOption(SpaceName)

/** Doesn't rename to a whitespace-only name or to the current name. */
export const spaceNameChange = (draft: string, current: string): Option.Option<SpaceName> =>
  decodeSpaceName(draft).pipe(Option.filter((name) => name !== current))

/** An empty name comes back as an empty string, which clears the tab's custom title. */
export const tabTitleChange = (draft: string, current: string): Option.Option<string> => {
  const title = draft.trim()
  return title === current ? Option.none() : Option.some(title)
}

/** Bookmarks never get an empty name. */
export const bookmarkTitleChange = (draft: string, current: string): Option.Option<string> => {
  const title = draft.trim()
  return title === "" || title === current ? Option.none() : Option.some(title)
}
