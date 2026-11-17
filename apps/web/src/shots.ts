/**
 * The screenshots the site shows, as apps/extension's scripts/render-store-screenshots.ts renders
 * them into apps/extension/store/website-screenshots/en/.
 */
export const SHOTS = [
  "1-spaces",
  "2-spotlight",
  "3-split-view",
  "3-split-pinned",
  "4-import",
  "5-themes",
  "6-bangs",
  "7-personal",
] as const

export type Shot = (typeof SHOTS)[number]

/** The colors a backdrop around a picture of Katip can take. */
export type Tone = "apricot" | "mint" | "lemon" | "sky" | "rose"

/**
 * The places on the site that show Katip at work. Each shows a still screenshot or a drawing
 * until a screen recording of the same name is added to src/clips/, as `<clip>.mp4` or
 * `<clip>.webm`, which then plays there in a loop instead.
 */
export const CLIPS = [
  "hero",
  "command-palette",
  "bangs",
  "shortcut",
  "split-view",
  "split-pin",
  "space-colors",
  "themes",
  "live-folders",
  "arc-import",
] as const

export type Clip = (typeof CLIPS)[number]
