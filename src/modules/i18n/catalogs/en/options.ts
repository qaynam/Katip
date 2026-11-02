import type { Message } from "../../message"

export const options = {
  "options.documentTitle": "Katip Settings",
  "options.title": "Settings",
  "options.loadFailed": "Couldn’t load your settings. Reload this page to try again.",
  "options.saved": "Saved",
  "options.saveFailed": "Couldn’t save the change. Wait a moment, then try again.",

  "options.general.heading": "General",
  "options.language.label": "Language",
  "options.language.automatic": "Automatic ({language})",
  "options.language.footnote": "Automatic matches your browser’s language.",
  "options.about.heading": "About Katip",
  "options.version.label": "Version",
  "options.sourceCode.label": "Source code",

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

  "options.spotlight.heading": "Spotlight",
  "options.spotlight.history.label": "Search browsing history too",
  "options.spotlight.history.footnote":
    "Turning this on asks for permission to read your browsing history. Turning it off removes the permission.",
  "options.spotlight.history.denied": "Access to browsing history wasn’t allowed.",

  "options.shortcuts.heading": "Shortcuts",
  "options.shortcuts.intro": "Keys are assigned on Chrome’s extension shortcuts page.",
  "options.shortcuts.open": "Edit in Chrome",
  "options.shortcuts.openFailed": "Couldn’t open Chrome’s shortcuts page.",
  "options.shortcuts.notSet": "Not set",
  "options.shortcuts.openAndMove.heading": "Open and move",
  "options.shortcuts.currentTab.heading": "Current tab",
  "options.shortcuts.copy.footnote":
    "A copy shortcut does nothing while it’s off. To use its key for something else, remove the key on Chrome’s shortcuts page.",
  "options.commands.openSidePanel": "Open the side panel",
  "options.commands.openSpotlight": "Open Spotlight",
  "options.commands.nextTabInSpace": "Next tab in the Space",
  "options.commands.previousTabInSpace": "Previous tab in the Space",
  "options.commands.togglePin": "Pin or unpin the tab",
  "options.commands.copyUrl": "Copy URL",
  "options.commands.copyMarkdownLink": "Copy URL as a Markdown link",

  "options.data.heading": "Data",
  "options.data.export.label": "Export your data",
  "options.data.export.button": "Export",
  "options.data.export.footnote":
    "Saves your Spaces, pinned tabs, open tabs, Favorites, and settings as a JSON file. Your GitHub token and archived tabs aren’t included.",
  "options.data.exported": "Exported",
  "options.data.exportFailed": "Couldn’t export your data. Wait a moment, then try again.",
} as const satisfies Readonly<Record<`options.${string}`, Message>>
