import { installPageShortcuts, keyboardPlatformOf } from "./page-shortcuts"

installPageShortcuts({
  extension: chrome,
  window,
  platform: keyboardPlatformOf(navigator.platform),
})
