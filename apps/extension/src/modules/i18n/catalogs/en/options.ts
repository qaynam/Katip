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
  "options.version.released": "Released on {date}",
  "options.updates.label": "Updates",
  "options.updates.check": "Check for Updates",
  "options.updates.checking": "Checking…",
  "options.updates.upToDate": "Katip is up to date.",
  "options.updates.available":
    "Version {version} is available. Download it from its release page and load it over this one.",
  "options.updates.openRelease": "Open release page",
  "options.updates.failed": "Couldn’t reach GitHub. Wait a moment, then try again.",
  "options.updates.automatic.label": "Check for updates automatically",
  "options.updates.automatic.description":
    "The first time the side panel opens after the browser starts, Katip asks GitHub for its latest release and tells you if it’s newer. Nothing from Katip is sent.",
  "options.github.label": "GitHub",

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

  "options.data.import.heading": "Import",
  "options.data.import.arc.label": "Import from Arc",
  "options.data.import.arc.description":
    "Adds your Arc Spaces with their pinned tabs, folders, and split views, and your Favorites.",
  "options.data.import.arc.file": "Arc’s sidebar file",
  "options.data.import.katip.label": "Import a Katip file",
  "options.data.import.katip.description":
    "Adds the Spaces, pinned tabs, and Favorites from a file exported from Katip.",
  "options.data.import.katip.file": "Katip export file",
  "options.data.import.choose": "Choose File…",
  "options.data.import.footnote":
    "The file is read on this device and never leaves your browser. Imported Spaces are added after yours, and nothing you have now is changed or removed.",
  "options.data.import.arcLocation.heading": "Where to find Arc’s file",
  "options.data.import.arcLocation.mac": "macOS",
  "options.data.import.arcLocation.macTip": "In the file dialog, press ⌘⇧G and paste this path.",
  "options.data.import.arcLocation.windows": "Windows",
  "options.data.import.arcLocation.windowsTip":
    "In the folder under Packages whose name starts with TheBrowserCompany.Arc_.",
  "options.data.import.arc.spaces": "Spaces to import",
  "options.data.import.arc.untitledSpace": "Untitled Space",
  "options.data.import.arc.profile.default": "Default profile",
  "options.data.import.arc.profile.other": "Other profile",
  "options.data.import.arc.arrangement": "How to add them",
  "options.data.import.arc.separate.label": "Separate Spaces",
  "options.data.import.arc.separate.description": "Each Arc Space becomes a Space of its own.",
  "options.data.import.arc.combined.label": "Combine into one Space",
  "options.data.import.arc.combined.description":
    "Adds one Space named {name}, with a folder for each Arc Space. If you already have a Space named {name}, the new one gets a number.",
  "options.data.import.preview.arcHeading": "Ready to import from Arc",
  "options.data.import.preview.katipHeading": "Ready to import a Katip file",
  "options.data.import.preview.added": "To be added",
  "options.data.import.preview.adjusted": "Changed to fit Katip",
  "options.data.import.preview.leftOut": "Not imported",
  "options.data.import.preview.spaces": { one: "{count} Space", other: "{count} Spaces" },
  "options.data.import.preview.pins": { one: "{count} pinned tab", other: "{count} pinned tabs" },
  "options.data.import.preview.folders": { one: "{count} folder", other: "{count} folders" },
  "options.data.import.preview.splits": {
    one: "{count} split view",
    other: "{count} split views",
  },
  "options.data.import.preview.liveFolders": {
    one: "{count} live folder",
    other: "{count} live folders",
  },
  "options.data.import.preview.favorites": { one: "{count} Favorite", other: "{count} Favorites" },
  "options.data.import.preview.flattenedFolders": {
    one: "{count} folder is nested deeper than Katip allows, so its contents go into the folder above it.",
    other:
      "{count} folders are nested deeper than Katip allows, so their contents go into the folder above them.",
  },
  "options.data.import.preview.widerSplits": {
    one: "{count} split view has more than two tabs. The first two stay split, and the rest become pinned tabs right after them.",
    other:
      "{count} split views have more than two tabs. In each, the first two stay split, and the rest become pinned tabs right after them.",
  },
  "options.data.import.preview.temporaryTabs": {
    one: "{count} unpinned tab, as unpinned tabs are temporary",
    other: "{count} unpinned tabs, as unpinned tabs are temporary",
  },
  "options.data.import.preview.favoritesAlreadySaved": {
    one: "{count} page already in Favorites",
    other: "{count} pages already in Favorites",
  },
  "options.data.import.preview.nonWebLinks": {
    one: "{count} tab that isn’t a web page, as only http and https addresses are imported",
    other: "{count} tabs that aren’t web pages, as only http and https addresses are imported",
  },
  "options.data.import.preview.unsupportedItems": {
    one: "{count} item Katip has nothing like, such as a note or an easel",
    other: "{count} items Katip has nothing like, such as notes and easels",
  },
  "options.data.import.preview.settings": "The file’s settings. Yours stay as they are.",
  "options.data.import.preview.nothing": "There’s nothing in this file to import.",
  "options.data.import.preview.noneChosen": "Choose at least one Space to import.",
  "options.data.import.preview.addOnly":
    "Only new Spaces are added. None of your Spaces are renamed, merged into, or removed.",
  "options.data.import.addFavorites.label": "Add to Favorites",
  "options.data.import.addFavorites.description":
    "They go after the Favorites you have, closed until you open them.",
  "options.data.import.addFavorites.descriptionByProfile":
    "They go after the Favorites you have, closed until you open them. Only Favorites from the profiles of the Spaces you chose are added.",
  "options.data.import.confirm": "Import",
  "options.data.import.cancel": "Cancel",
  "options.data.import.problem.notArc":
    "This isn’t Arc’s sidebar file. Choose StorableSidebar.json.",
  "options.data.import.problem.katipFileChosen":
    "This is a file exported from Katip. Use Import a Katip file instead.",
  "options.data.import.problem.notKatip": "This isn’t a file exported from Katip.",
  "options.data.import.problem.arcFileChosen":
    "This is Arc’s sidebar file. Use Import from Arc instead.",
  "options.data.import.problem.newerVersion":
    "This file was exported from a newer version of Katip. Update Katip, then try again.",
  "options.data.import.problem.malformed": "This Katip file is damaged and can’t be read.",
  "options.data.import.problem.unreadable": "Couldn’t read the file.",
  "options.data.import.problem.unavailable":
    "Couldn’t prepare the import. Wait a moment, then try again.",
  "options.data.imported": "Imported",
  "options.data.importFailed":
    "Couldn’t finish the import. Any Spaces added before it stopped are kept.",
} as const satisfies Readonly<Record<`options.${string}`, Message>>
