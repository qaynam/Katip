/** The settings page's path from the extension's root. */
export const SETTINGS_PAGE_PATH = "options/index.html"

/** The settings page opened at the Spotlight settings, where history search is turned on. */
export const historySearchSettingsUrl = (extensionOrigin: string): string =>
  new URL(`${SETTINGS_PAGE_PATH}#spotlight`, extensionOrigin).href
