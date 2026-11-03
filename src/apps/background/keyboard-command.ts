/**
 * The names of the manifest's keyboard commands, as `chrome.commands` reports them.
 *
 * @remarks
 * In a module of its own so the view source can name a command without importing the command
 * handlers, which import the view source.
 */
export const KeyboardCommand = {
  quickPinToggle: "quick-pin-toggle",
  nextTabInSpace: "next-tab-in-space",
  previousTabInSpace: "previous-tab-in-space",
  copyCurrentUrl: "copy-current-url",
  copyCurrentUrlAsMarkdown: "copy-current-url-as-markdown",
  openSpotlight: "open-spotlight",
} as const
