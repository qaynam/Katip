import { Effect } from "effect"
import { Tabs } from "#platform/browser"

const CHROME_SHORTCUTS_URL = "chrome://extensions/shortcuts"

// Not a link: chrome:// pages can't be opened from one, only through the extension API
/** Opens Chrome's page for assigning extension shortcuts, in a new tab. */
export const openChromeShortcutSettings = Effect.asVoid(
  Tabs.use((tabs) => tabs.create({ url: CHROME_SHORTCUTS_URL })),
)
