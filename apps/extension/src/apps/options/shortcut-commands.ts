import type { Settings, SettingsPatch } from "#modules/settings"
import type { PlainMessageKey } from "./plain-message-key"

/** A command the manifest declares, as the Shortcuts category lists it. */
export interface ShortcutCommand {
  /** The command's name under `commands` in the manifest. */
  readonly name: string
  readonly label: PlainMessageKey
  /** Present for commands that do nothing until they're turned on in the settings. */
  readonly toggle?: {
    readonly isEnabled: (settings: Settings) => boolean
    readonly patch: (enabled: boolean) => SettingsPatch
  }
}

export const OPEN_AND_MOVE_COMMANDS: ReadonlyArray<ShortcutCommand> = [
  { name: "_execute_action", label: "options.commands.openSidePanel" },
  { name: "open-spotlight", label: "options.commands.openSpotlight" },
  { name: "next-tab-in-space", label: "options.commands.nextTabInSpace" },
  { name: "previous-tab-in-space", label: "options.commands.previousTabInSpace" },
]

export const CURRENT_TAB_COMMANDS: ReadonlyArray<ShortcutCommand> = [
  { name: "quick-pin-toggle", label: "options.commands.togglePin" },
  {
    name: "copy-current-url",
    label: "options.commands.copyUrl",
    toggle: {
      isEnabled: (settings) => settings.pageShortcuts.copyUrl,
      patch: (enabled) => ({ pageShortcuts: { copyUrl: enabled } }),
    },
  },
  {
    name: "copy-current-url-as-markdown",
    label: "options.commands.copyMarkdownLink",
    toggle: {
      isEnabled: (settings) => settings.pageShortcuts.copyMarkdownLink,
      patch: (enabled) => ({ pageShortcuts: { copyMarkdownLink: enabled } }),
    },
  },
]
