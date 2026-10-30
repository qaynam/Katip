import type { Message } from "../message"

export const en = {
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

  "options.documentTitle": "Katip Settings",
  "options.title": "Settings",
  "options.loadFailed": "Couldn’t load your settings. Reload this page to try again.",
  "options.saved": "Saved",
  "options.saveFailed": "Couldn’t save the change. Wait a moment, then try again.",

  "options.language.label": "Language",
  "options.language.automatic": "Automatic ({language})",
  "options.language.footnote": "Automatic matches your browser’s language.",

  "options.tabs.heading": "Tabs",
  "options.newTabsOnTop.label": "Show new tabs at the top",
  "options.newTabsOnTop.description":
    "When off, temporary tabs follow the order of Chrome’s tab strip, and new tabs are added at the bottom.",
  "options.collapsedFolders.label": "Show all open tabs in collapsed folders",
  "options.collapsedFolders.description":
    "When off, a collapsed folder shows only its active tab and the tabs you viewed while it was collapsed.",
  "options.syncTabGroups.label": "Sync Spaces with Chrome tab groups",
  "options.syncTabGroups.description":
    "Shows each Space as a tab group in every window. Renaming or recoloring a group doesn’t change the Space and is undone at the next sync. While syncing, folders can’t contain other folders.",
  "options.splitView.label": "Split view",
  "options.splitView.available": "Available",
  "options.splitView.unavailable": "Not available in this browser (requires Chrome 155 or later)",

  "options.autoArchive.heading": "Archive",
  "options.autoArchive.label": "Archive inactive tabs automatically",
  "options.autoArchive.idleTime.label": "Archive after",
  "options.autoArchive.footnote":
    "Temporary tabs you haven’t viewed for this long are closed and saved to the archive, where you can reopen them later. Pinned tabs, Favorites, tabs playing audio, and the tab you’re viewing are never closed.",

  "options.shortcuts.label": "Keyboard shortcuts",
  "options.shortcuts.open": "Edit in Chrome",
  "options.shortcuts.openFailed": "Couldn’t open Chrome’s shortcuts page.",
  "options.shortcuts.footnote":
    "Assign keys for opening the side panel, Spotlight, and more on Chrome’s extension shortcuts page.",

  "options.version.label": "Version",

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
} as const satisfies Readonly<Record<string, Message>>
