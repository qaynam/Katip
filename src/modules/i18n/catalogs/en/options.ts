import type { Message } from "../../message"

export const options = {
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

  "options.pageShortcuts.heading": "Shortcuts",
  "options.pageShortcuts.footnote":
    "Available while you’re viewing a web page. Turning one on asks for access to all sites, which is used only to receive these keys. They don’t work on chrome:// pages, the New Tab page, or the Chrome Web Store.",
  "options.pageShortcuts.denied": "Access to all sites wasn’t allowed, so the shortcut stays off.",

  "options.spotlight.heading": "Spotlight",
  "options.spotlight.history.label": "Search browsing history too",
  "options.spotlight.history.footnote":
    "Turning this on asks for permission to read your browsing history. Turning it off removes the permission.",
  "options.spotlight.history.denied": "Access to browsing history wasn’t allowed.",

  "options.data.heading": "Data",
  "options.data.export.label": "Export your data",
  "options.data.export.button": "Export",
  "options.data.export.footnote":
    "Saves your Spaces, pinned tabs, open tabs, Favorites, and settings as a JSON file. Your GitHub token and archived tabs aren’t included.",
  "options.data.exported": "Exported",
  "options.data.exportFailed": "Couldn’t export your data. Wait a moment, then try again.",

  "options.version.label": "Version",
  "options.sourceCode.label": "Source code",
} as const satisfies Readonly<Record<`options.${string}`, Message>>
