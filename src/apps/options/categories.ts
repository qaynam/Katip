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
}

const color = (hue: number, chroma: number): ThemeColor => ({ hue, chroma })

/**
 * The one tint behind every category.
 *
 * @remarks
 * Not a tint per category: recoloring the whole window on every click pulled the eye away from the
 * settings. Weaker than a Space's default intensity, because the page is read for longer than the
 * side panel is glanced at and a strong tint behind the text tires the eyes.
 */
export const SETTINGS_THEME: SpaceTheme = {
  ...themeOf([color(90, 0.1), color(250, 0.15)]),
  intensity: 0.4,
}

export const categoryLooks: Readonly<Record<Category, CategoryLook>> = {
  General: {
    heading: "options.general.heading",
    slug: "general",
    icon: "sliders",
  },
  Tabs: {
    heading: "options.tabs.heading",
    slug: "tabs",
    icon: "tabs",
  },
  Archive: {
    heading: "options.autoArchive.heading",
    slug: "archive",
    icon: "archive",
  },
  Spotlight: {
    heading: "options.spotlight.heading",
    slug: "spotlight",
    icon: "search",
  },
  Shortcuts: {
    heading: "options.shortcuts.heading",
    slug: "shortcuts",
    icon: "command",
  },
  Data: {
    heading: "options.data.heading",
    slug: "data",
    icon: "export",
  },
}

/** The category a URL fragment such as "#tabs" opens, or null when it names none. */
export const categoryOfFragment = (fragment: string): Category | null =>
  CATEGORIES.find((category) => `#${categoryLooks[category].slug}` === fragment) ?? null
