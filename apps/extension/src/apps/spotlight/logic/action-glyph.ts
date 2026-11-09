import { Match } from "effect"
import type { Action } from "#modules/actions"

export type ActionGlyph =
  "link" | "markdown" | "pin" | "duplicate" | "close" | "speaker" | "move" | "sweep" | "settings"

/**
 * The icon of a command. One per command whatever the tab's state: a pin for pinning and unpinning
 * alike, a speaker for muting and unmuting, as the title already says which way it goes.
 */
export const actionGlyphOf = (action: Action): ActionGlyph =>
  Match.valueTags(action, {
    CopyUrl: () => "link" as const,
    CopyMarkdownLink: () => "markdown" as const,
    TogglePin: () => "pin" as const,
    DuplicateTab: () => "duplicate" as const,
    CloseTab: () => "close" as const,
    ToggleMute: () => "speaker" as const,
    MoveTabToSpace: () => "move" as const,
    CloseTemporaryTabs: () => "sweep" as const,
    OpenSettings: () => "settings" as const,
  })
