import type { PageShortcutSettings } from "#modules/settings"
import { shortcutAsShown } from "#platform/keyboard-shortcuts"
import type { ShortcutStatus } from "./shortcut-status"

/**
 * A key the browser keeps for itself, which Katip can't suggest but people can assign in Chrome's
 * shortcut settings, in a manifest's notation for macOS and for other systems.
 */
export interface BrowserKey {
  readonly mac: string
  readonly default: string
  /** Says what the command does with the key; takes the key as `{key}`. */
  readonly hint: "onboarding.shortcuts.addressBarKey" | "onboarding.shortcuts.newTabKey"
}

/** A command the shortcuts step lists, by its name under `commands` in the manifest. */
export interface OnboardingShortcut {
  readonly command: string
  readonly label:
    | "options.commands.openSidePanel"
    | "options.commands.openSpotlight"
    | "options.commands.editCurrentUrl"
    | "options.commands.copyUrl"
    | "options.commands.copyMarkdownLink"
  /** For a command that does nothing until it is turned on in the settings. */
  readonly turnedOnBy?: keyof PageShortcutSettings
  /** A key of the browser's own that the command is worth having in its place. */
  readonly browserKey?: BrowserKey
}

/**
 * The commands Katip suggests keys for, which Chrome may have refused, and the one that edits the
 * address, which only a key people assign themselves reaches.
 */
export const ONBOARDING_SHORTCUTS: ReadonlyArray<OnboardingShortcut> = [
  { command: "_execute_action", label: "options.commands.openSidePanel" },
  {
    command: "open-spotlight",
    label: "options.commands.openSpotlight",
    browserKey: { mac: "Command+T", default: "Ctrl+T", hint: "onboarding.shortcuts.newTabKey" },
  },
  {
    command: "edit-current-url",
    label: "options.commands.editCurrentUrl",
    browserKey: { mac: "Command+L", default: "Ctrl+L", hint: "onboarding.shortcuts.addressBarKey" },
  },
  { command: "copy-current-url", label: "options.commands.copyUrl", turnedOnBy: "copyUrl" },
  {
    command: "copy-current-url-as-markdown",
    label: "options.commands.copyMarkdownLink",
    turnedOnBy: "copyMarkdownLink",
  },
]

/**
 * The browser's key to suggest for `shortcut`, written as the browser shows keys, with what it
 * does. null for a command without one, or one that has it already.
 */
export const browserKeyToSuggest = (
  shortcut: OnboardingShortcut,
  status: ShortcutStatus,
  isMac: boolean,
): { readonly key: string; readonly hint: BrowserKey["hint"] } | null => {
  if (shortcut.browserKey === undefined) return null
  const { mac, default: other, hint } = shortcut.browserKey
  const key = shortcutAsShown(isMac ? mac : other, isMac)
  return status._tag === "Assigned" && status.key === key ? null : { key, hint }
}

/** The command whose key the onboarding teaches for opening the side panel. */
export const OPEN_SIDE_PANEL_COMMAND = "_execute_action"
