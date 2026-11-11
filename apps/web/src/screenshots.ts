import type { ImageMetadata } from "astro"
import type { Language } from "./languages.ts"
import type { Shot } from "./shots.ts"

const WINDOWS = import.meta.glob<ImageMetadata>(
  "../../extension/store/website-screenshots/*/*.png",
  { eager: true, import: "default" },
)

/**
 * The browser window from one of the store screenshots, as apps/extension's
 * scripts/render-store-screenshots.ts renders it for the website: without the caption, at twice
 * the store's resolution.
 *
 * @throws Error when no screenshot of that name has been rendered.
 */
export const screenshot = (language: Language, shot: Shot): ImageMetadata => {
  const image = WINDOWS[`../../extension/store/website-screenshots/${language}/${shot}.png`]
  if (image === undefined) {
    throw new Error(`There is no screenshot ${language}/${shot}.png for the website`)
  }
  return image
}
