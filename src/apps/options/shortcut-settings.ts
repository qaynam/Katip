import { Effect } from "effect"
import { Tabs } from "#platform/browser"

const CHROME_SHORTCUTS_URL = "chrome://extensions/shortcuts"

// chrome:// のページはリンクからは開けず、拡張の API で開く必要がある
export const openChromeShortcutSettings = Effect.asVoid(
  Tabs.use((tabs) => tabs.create({ url: CHROME_SHORTCUTS_URL })),
)
