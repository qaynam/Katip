import type { Message } from "../../message"

export const actions = {
  "actions.copyUrl": "Copy URL",
  "actions.copyMarkdownLink": "Copy URL as Markdown Link",
  "actions.pinTab": "Pin Tab",
  "actions.unpinTab": "Unpin Tab",
  "actions.duplicateTab": "Duplicate Tab",
  "actions.closeTab": "Close Tab",
  "actions.muteTab": "Mute Tab",
  "actions.unmuteTab": "Unmute Tab",
  "actions.moveTabToSpace": "Move Tab to {space}",
  "actions.closeTemporaryTabs": "Close All Temporary Tabs",
  "actions.openSettings": "Open Settings",
  "actions.copied.url": "Copied URL",
  "actions.copied.markdownLink": "Copied Markdown link",
  "actions.copyFailed": "Couldn’t copy",
} as const satisfies Readonly<Record<`actions.${string}`, Message>>
