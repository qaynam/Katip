import { type SpaceTheme, type ThemeColor, themeOf } from "#modules/theme"
import type { GlyphName } from "./Glyph.svelte"
import type { PlainMessageKey } from "./plain-message-key"

/** The groups of settings, in the order the page lists them. The first opens by default. */
export const CATEGORIES = ["General", "Tabs", "Archive", "Spotlight", "Shortcuts", "Data"] as const
export type Category = (typeof CATEGORIES)[number]

export interface CategoryLook {
  readonly heading: PlainMessageKey
  /** The URL fragment that opens the category, so a reload or a link lands on it. */
  readonly slug: string
  readonly icon: GlyphName
  /** Each category tints the page like a Space, so switching categories reads like switching Spaces. */
  readonly theme: SpaceTheme
}

const color = (hue: number, chroma: number): ThemeColor => ({ hue, chroma })

// Weaker than a Space's default intensity: the page is read for longer than the side panel is
// glanced at, and a strong tint behind the text would tire the eyes
const settingsTheme = (colors: ReadonlyArray<ThemeColor>): SpaceTheme => ({
  ...themeOf(colors),
  intensity: 0.4,
})

export const categoryLooks: Readonly<Record<Category, CategoryLook>> = {
  General: {
    heading: "options.general.heading",
    slug: "general",
    icon: "sliders",
    theme: settingsTheme([color(90, 0.1), color(250, 0.15)]),
  },
  Tabs: {
    heading: "options.tabs.heading",
    slug: "tabs",
    icon: "tabs",
    theme: settingsTheme([color(175, 0.5), color(220, 0.45)]),
  },
  Archive: {
    heading: "options.autoArchive.heading",
    slug: "archive",
    icon: "archive",
    theme: settingsTheme([color(65, 0.5), color(95, 0.35)]),
  },
  Spotlight: {
    heading: "options.spotlight.heading",
    slug: "spotlight",
    icon: "search",
    theme: settingsTheme([color(225, 0.5), color(275, 0.45)]),
  },
  Shortcuts: {
    heading: "options.shortcuts.heading",
    slug: "shortcuts",
    icon: "command",
    theme: settingsTheme([color(260, 0.35), color(310, 0.35)]),
  },
  Data: {
    heading: "options.data.heading",
    slug: "data",
    icon: "export",
    theme: settingsTheme([color(135, 0.45), color(175, 0.4)]),
  },
}

/** The category a URL fragment such as "#tabs" opens, or null when it names none. */
export const categoryOfFragment = (fragment: string): Category | null =>
  CATEGORIES.find((category) => `#${categoryLooks[category].slug}` === fragment) ?? null
