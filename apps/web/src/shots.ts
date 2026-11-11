/**
 * The store screenshots the site shows, named as in
 * apps/extension/store/website-screenshots/<language>/.
 */
export const SHOTS = [
  "1-spaces",
  "2-spotlight",
  "3-split-view",
  "4-import",
  "5-themes",
  "6-bangs",
] as const

export type Shot = (typeof SHOTS)[number]
