import { Schema } from "effect"
import { SpaceId } from "#modules/space"

/**
 * Spotlight のコマンドや、ページ上のショートカットから実行する操作。
 * 対象は、実行したウィンドウでアクティブなタブ。
 */
export const Action = Schema.TaggedUnion({
  CopyUrl: {},
  CopyMarkdownLink: {},
  TogglePin: {},
  DuplicateTab: {},
  CloseTab: {},
  ToggleMute: {},
  MoveTabToSpace: { spaceId: SpaceId },
  CloseTemporaryTabs: {},
  OpenSettings: {},
})
export type Action = typeof Action.Type
