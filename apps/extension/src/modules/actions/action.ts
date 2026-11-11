import { Schema } from "effect"
import { SpaceId } from "#modules/space"

/**
 * An operation run from Spotlight's commands, on the active tab of the window it was run from.
 */
export const Action = Schema.TaggedUnion({
  CopyUrl: {},
  CopyMarkdownLink: {},
  TogglePin: {},
  DuplicateTab: {},
  SplitWithNewTab: {},
  Unsplit: {},
  CloseTab: {},
  ToggleMute: {},
  MoveTabToSpace: { spaceId: SpaceId },
  CloseTemporaryTabs: {},
  OpenSettings: {},
})
export type Action = typeof Action.Type
