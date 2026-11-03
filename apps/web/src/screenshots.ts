import type { ImageMetadata } from "astro"
import type { Language } from "./languages.ts"
import type { Shot } from "./shots.ts"

const CROPPED = import.meta.glob<ImageMetadata>("../generated/screenshots/*/*.png", {
  eager: true,
  import: "default",
})

/**
 * The browser window from one of the store screenshots, as scripts/crop-screenshots.ts cut it out.
 *
 * @throws Error when the crop hasn't run; the `dev` and `build` scripts run it first.
 */
export const screenshot = (language: Language, shot: Shot): ImageMetadata => {
  const image = CROPPED[`../generated/screenshots/${language}/${shot}.png`]
  if (image === undefined) {
    throw new Error(
      `There is no cropped screenshot ${language}/${shot}.png. Run node scripts/crop-screenshots.ts`,
    )
  }
  return image
}
