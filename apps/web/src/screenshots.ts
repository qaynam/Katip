import type { ImageMetadata } from "astro"
import type { Clip, Shot } from "./shots.ts"

const WINDOWS = import.meta.glob<ImageMetadata>(
  "../../extension/store/website-screenshots/en/*.png",
  { eager: true, import: "default" },
)

const RECORDINGS = import.meta.glob<string>("./clips/*.{mp4,webm}", {
  eager: true,
  import: "default",
})

/**
 * The browser window from one of the store screenshots, as apps/extension's
 * scripts/render-store-screenshots.ts renders it for the website: without the caption, at twice
 * the store's resolution.
 *
 * @throws Error when no screenshot of that name has been rendered.
 */
export const screenshot = (shot: Shot): ImageMetadata => {
  const image = WINDOWS[`../../extension/store/website-screenshots/en/${shot}.png`]
  if (image === undefined) {
    throw new Error(`There is no screenshot en/${shot}.png for the website`)
  }
  return image
}

/** The URL of the screen recording added for `clip`, or undefined while there is none. */
export const recordingOf = (clip: Clip): string | undefined =>
  RECORDINGS[`./clips/${clip}.mp4`] ?? RECORDINGS[`./clips/${clip}.webm`]
