import type { Message } from "../../message"

export const onboarding = {
  "onboarding.documentTitle": "Welcome to Katip",
  "onboarding.progress": "Step {current} of {total}",
  "onboarding.continue": "Continue",
  "onboarding.back": "Back",
  "onboarding.skip": "Skip",

  "onboarding.welcome.title": "Welcome to Katip",
  "onboarding.welcome.lead":
    "Spaces, pinned tabs and Spotlight, right in Chrome’s side panel. Setting it up takes a minute.",
  "onboarding.welcome.start": "Get Started",

  "onboarding.sidePanel.title": "Katip lives in the side panel",
  "onboarding.sidePanel.body":
    "Click Katip’s icon in the toolbar to open it. To keep the icon in sight, pin it from the extensions menu, the one with the puzzle piece.",
  "onboarding.sidePanel.shortcut": "Or press",
  "onboarding.sidePanel.open": "Open the Side Panel",

  "onboarding.shortcuts.title": "Check your shortcuts",
  "onboarding.shortcuts.body":
    "Chrome gives a key only to the first extension that asks for it. If another extension got there first, Katip’s key stays unset, even though Chrome’s shortcuts page may still show it.",
  "onboarding.shortcuts.notSet": "Not set",
  "onboarding.shortcuts.refused":
    "Chrome didn’t give Katip {key}, most likely because another extension uses it.",
  "onboarding.shortcuts.copyNote": "The copy shortcuts do nothing until you turn them on here.",
  "onboarding.shortcuts.edit": "Edit in Chrome",

  "onboarding.arcImport.title": "Coming from Arc?",
  "onboarding.arcImport.body":
    "Bring over your Spaces with their pinned tabs, folders and split views, and your Favorites. You choose Arc’s sidebar file in the settings, and it is read right in your browser.",
  "onboarding.arcImport.open": "Import from Arc…",

  "onboarding.favorites.title": "Favorites, in every Space",
  "onboarding.favorites.body":
    "Drag a tab to the top of the side panel, or right-click it and choose Add to Favorites. Favorites stay put whichever Space you’re in.",

  "onboarding.themes.title": "A color for each Space",
  "onboarding.themes.body":
    "Open the Space menu next to a Space’s name and choose Edit Theme. The side panel takes on the color you pick, so you can tell your Spaces apart at a glance.",

  "onboarding.liveFolders.title": "Folders that keep themselves up to date",
  "onboarding.liveFolders.body":
    "Choose Add Live Folder in the Space menu to follow your unread mail in Gmail, or your review requests, pull requests, issues and mentions on GitHub. They refresh on their own.",

  "onboarding.bangs.title": "Search any site with a bang",
  "onboarding.bangs.body":
    "In Spotlight, type ! and a site’s shortcut, as in !gh katip for GitHub or !w for Wikipedia. You can add commands of your own in the settings.",

  "onboarding.done.title": "You’re all set",
  "onboarding.done.body": "You can take this tour again from Katip’s settings.",
  "onboarding.done.openKatip": "Open Katip",
  "onboarding.done.close": "Close",
} as const satisfies Readonly<Record<string, Message>>
