import type { Message } from "../../message"

export const common = {
  "common.home": "Home",
  "common.spaceNumbered": "Space {n}",
  "common.newFolder": "New Folder",
  "common.newTab": "New Tab",
  "common.tabCount": { one: "{count} tab", other: "{count} tabs" },
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.delete": "Delete",
  "common.rename": "Rename",
  "common.duration.minute": { one: "{count} minute", other: "{count} minutes" },
  "common.duration.hour": { one: "{count} hour", other: "{count} hours" },
  "common.duration.day": { one: "{count} day", other: "{count} days" },
  "common.duration.week": { one: "{count} week", other: "{count} weeks" },
} as const satisfies Readonly<Record<`common.${string}`, Message>>
