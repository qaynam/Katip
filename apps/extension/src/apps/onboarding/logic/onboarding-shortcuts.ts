import type { PageShortcutSettings } from "#modules/settings"

/** A command the shortcuts step lists, by its name under `commands` in the manifest. */
export interface OnboardingShortcut {
  readonly command: string
  readonly label:
    | "options.commands.openSidePanel"
    | "options.commands.openSpotlight"
    | "options.commands.copyUrl"
    | "options.commands.copyMarkdownLink"
  /** For a command that does nothing until it is turned on in the settings. */
  readonly turnedOnBy?: keyof PageShortcutSettings
}

/** The commands Katip suggests keys for, which Chrome may have refused. */
export const ONBOARDING_SHORTCUTS: ReadonlyArray<OnboardingShortcut> = [
  { command: "_execute_action", label: "options.commands.openSidePanel" },
  { command: "open-spotlight", label: "options.commands.openSpotlight" },
  { command: "copy-current-url", label: "options.commands.copyUrl", turnedOnBy: "copyUrl" },
  {
    command: "copy-current-url-as-markdown",
    label: "options.commands.copyMarkdownLink",
    turnedOnBy: "copyMarkdownLink",
  },
]

/** The command whose key the onboarding teaches for opening the side panel. */
export const OPEN_SIDE_PANEL_COMMAND = "_execute_action"
