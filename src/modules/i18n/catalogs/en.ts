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

  "options.documentTitle": "Katip Settings",
  "options.title": "Settings",
  "options.loadFailed": "Couldn’t load your settings. Reload this page to try again.",
  "options.saved": "Saved",
  "options.saveFailed": "Couldn’t save the change. Wait a moment, then try again.",
  "options.stepper.increment": "Increase",
  "options.stepper.decrement": "Decrease",

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

  "options.autoArchive.heading": "Archive",
  "options.autoArchive.label": "Archive inactive tabs automatically",
  "options.autoArchive.idleTime.label": "Archive after",
  "options.autoArchive.idleTime.unit": { one: "minute", other: "minutes" },
  "options.autoArchive.idleTime.empty": "Enter the number of minutes.",
  "options.autoArchive.idleTime.invalid": "Enter a whole number of 1 or more.",
  "options.autoArchive.footnote":
    "Temporary tabs you haven’t viewed for this long are closed and saved to the archive, where you can reopen them later. Pinned tabs, Favorites, tabs playing audio, and the tab you’re viewing are never closed.",

  "options.shortcuts.label": "Keyboard shortcuts",
  "options.shortcuts.open": "Edit in Chrome",
  "options.shortcuts.openFailed": "Couldn’t open Chrome’s shortcuts page.",
  "options.shortcuts.footnote":
    "Assign keys for opening the side panel, Spotlight, and more on Chrome’s extension shortcuts page.",

  "options.version.label": "Version",
} as const satisfies Readonly<Record<string, Message>>
