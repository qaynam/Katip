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
  // isOpen tells whether the side panel was open in the window when the action was offered. Only a
  // key press in Spotlight can open it, so Spotlight opens it itself and the background only ever
  // closes it
  ToggleSidebar: { isOpen: Schema.Boolean },
  OpenArchive: {},
  OpenDownloads: {},
  // Not run by the background: Spotlight turns into a search of the browsing history alone
  SearchHistory: {},
  OpenSettings: {},
})
export type Action = typeof Action.Type
