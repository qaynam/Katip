/** The store screenshots the site shows, named as in apps/extension/store/screenshots/<language>/. */
export const SHOTS = ["1-spaces", "2-spotlight", "3-split-view", "4-import", "5-themes"] as const

export type Shot = (typeof SHOTS)[number]

/** Where scripts/crop-screenshots.ts puts the browser window cut out of each screenshot. */
export const CROPPED_SHOTS_DIR = "generated/screenshots"
