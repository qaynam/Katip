/** The pages that frame screenshots of Katip for the store listing, rendered to PNG by a browser. */

import { fileURLToPath, pathToFileURL } from "node:url"
import { BLUE_BOTTOM, iconSvg } from "../brand/icon.ts"
import { ICON_MARGIN, INK, wordmarkSvg } from "../brand/logo.ts"
import type { Caption } from "./samples.ts"

const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

export interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** The sizes the store asks for: of a screenshot, the small promo tile, and the marquee. */
export const CANVAS = { width: 1280, height: 800 } as const
export const SMALL_TILE = { width: 440, height: 280 } as const
export const MARQUEE = { width: 1400, height: 560 } as const

/**
 * The image shown when a link to the website is shared. X's large card is 2:1; sites with
 * 1.91:1 cards crop only a sliver off its sides.
 */
export const SOCIAL_CARD = { width: 1200, height: 600 } as const

/** The browser window under the caption. */
export const STAGE: Box = { left: 96, top: 184, width: 1088, height: 576 }

/** Where the side panel sits in the window, and where the page beside it does. */
export const SIDEBAR_BOX: Box = { left: 0, top: 0, width: 300, height: STAGE.height }
export const PAGE_BOX: Box = {
  left: SIDEBAR_BOX.width + 1,
  top: 0,
  width: STAGE.width - SIDEBAR_BOX.width - 1,
  height: STAGE.height,
}

const SPLIT_GAP = 7
// Whole pixels, so neither half is resampled
const SPLIT_LEFT_WIDTH = Math.floor((PAGE_BOX.width - SPLIT_GAP) / 2)

/** The two halves of the page area in split view, left then right. */
export const SPLIT_BOXES: readonly [Box, Box] = [
  { ...PAGE_BOX, width: SPLIT_LEFT_WIDTH },
  {
    ...PAGE_BOX,
    left: PAGE_BOX.left + SPLIT_LEFT_WIDTH + SPLIT_GAP,
    width: PAGE_BOX.width - SPLIT_LEFT_WIDTH - SPLIT_GAP,
  },
]

const SECONDARY_INK = "#6E6E73"
const BACKDROP = "#F5F5F7"

const fontFaces = [400, 500, 600, 700]
  .map(
    (weight) =>
      `@font-face { font-family: Inter; font-weight: ${weight}; src: url(${
        pathToFileURL(
          fromRoot(`node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff2`),
        ).href
      }) format("woff2"); }`,
  )
  .join("\n")

const svgSource = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`

const ICON = svgSource(iconSvg({ layout: "grid" }))
const WORDMARK = svgSource(wordmarkSvg("light"))

/** The icon pulled left by its empty margin, so the squircle lines up with the text under it. */
const flushIcon = (size: number) =>
  `<img src="${ICON}" width="${size}" height="${size}" alt="" style="margin-left:${-size * ICON_MARGIN}px">`

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

const px = (box: Box) =>
  `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px`

/** A screenshot file shown at its own pixel size, so it stays as sharp as it was captured. */
export const image = (file: string, box: Box, className = "") =>
  `<img class="${className}" src="${pathToFileURL(file).href}" style="${px(box)}" alt="">`

const page = (lang: string, size: { width: number; height: number }, style: string, body: string) =>
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
${fontFaces}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { position: relative; width: ${size.width}px; height: ${size.height}px; overflow: hidden; background: ${BACKDROP}; color: ${INK.light}; font-family: Inter, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif; -webkit-font-smoothing: antialiased; word-break: auto-phrase; text-wrap: balance; }
img { position: absolute; display: block; }
.window { position: absolute; overflow: hidden; border-radius: 14px; background: #fff; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.07), 0 24px 60px rgb(0 0 0 / 0.13), 0 6px 16px rgb(0 0 0 / 0.05); }
.window > .divider { position: absolute; background: rgb(0 0 0 / 0.1); }
.window > .gap { position: absolute; background: #E4E5E9; }
${style}
</style></head><body>${body}</body></html>`

/** A window holding `content`, which is placed relative to the window's corner. */
export const windowFrame = (box: Box, content: string) =>
  `<div class="window" style="${px(box)}">${content}</div>`

/** The thin line between the side panel and the page. */
export const sidebarDivider = () =>
  `<div class="divider" style="${px({ left: SIDEBAR_BOX.width, top: 0, width: 1, height: STAGE.height })}"></div>`

/** The bar between the two pages of a split view. */
export const splitGap = () => {
  const [left, right] = SPLIT_BOXES
  const start = left.left + left.width
  return `<div class="gap" style="${px({ left: start, top: 0, width: right.left - start, height: STAGE.height })}"></div>`
}

/**
 * A store screenshot: the caption centered at the top, the browser window under it, and anything
 * in `overlay` (placed relative to the canvas) above the window.
 */
export const screenshotHtml = ({
  lang,
  caption,
  window,
  overlay = "",
}: {
  readonly lang: string
  readonly caption: Caption
  readonly window: string
  readonly overlay?: string
}) =>
  page(
    lang,
    CANVAS,
    `
body { background: radial-gradient(90% 60% at 50% 0%, #FFFFFF 0%, ${BACKDROP} 70%); }
.caption { position: absolute; left: 0; right: 0; top: 40px; text-align: center; }
.eyebrow { display: inline-flex; align-items: center; gap: 8px; color: ${BLUE_BOTTOM}; font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }
.eyebrow img { position: static; width: 24px; height: 24px; }
h1 { margin: 10px 0 0; font-size: 40px; line-height: 1.15; font-weight: 700; letter-spacing: -0.022em; }
p { margin: 10px 0 0; color: ${SECONDARY_INK}; font-size: 18px; line-height: 1.4; letter-spacing: -0.005em; }
.floating { border-radius: 14px; box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.12), 0 28px 70px rgb(0 0 0 / 0.28), 0 8px 20px rgb(0 0 0 / 0.1); }
`,
    `<div class="caption">
  <div class="eyebrow"><img src="${ICON}" alt="">${escape(caption.eyebrow)}</div>
  <h1>${escape(caption.title)}</h1>
  <p>${escape(caption.subtitle)}</p>
</div>
${window}
${overlay}`,
  )

/** The tile in the store's lists: the icon and name, with a glimpse of the side panel. */
export const smallTileHtml = ({
  tagline,
  sidebar,
}: {
  readonly tagline: string
  readonly sidebar: string
}) =>
  page(
    "en",
    SMALL_TILE,
    `
body { background: radial-gradient(120% 100% at 0% 0%, #FFFFFF 0%, ${BACKDROP} 70%); }
.brand { position: absolute; left: 32px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; gap: 14px; width: 200px; }
.brand img { position: static; }
.tagline { margin: 0; color: ${SECONDARY_INK}; font-size: 15px; line-height: 1.35; font-weight: 500; letter-spacing: -0.005em; }
.window { border-radius: 12px 0 0 0; }
`,
    `<div class="brand">
  ${flushIcon(72)}
  <img src="${WORDMARK}" width="118" alt="">
  <p class="tagline">${escape(tagline)}</p>
</div>
${sidebar}`,
  )

/** The wide banner at the top of the listing: the name and headline beside the browser window. */
export const marqueeHtml = ({
  headline,
  subtitle,
  window,
}: {
  readonly headline: string
  readonly subtitle: string
  readonly window: string
}) =>
  page(
    "en",
    MARQUEE,
    `
body { background: radial-gradient(80% 120% at 0% 0%, #FFFFFF 0%, ${BACKDROP} 65%); }
.brand { position: absolute; left: 80px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; width: 500px; }
.brand img { position: static; }
.logo { display: flex; align-items: center; gap: 14px; }
h1 { margin: 34px 0 0; font-size: 44px; line-height: 1.1; font-weight: 700; letter-spacing: -0.025em; }
p { margin: 14px 0 0; color: ${SECONDARY_INK}; font-size: 19px; line-height: 1.4; }
.window { border-radius: 14px 0 0 0; }
`,
    `<div class="brand">
  <div class="logo">${flushIcon(64)}<img src="${WORDMARK}" width="120" alt=""></div>
  <h1>${escape(headline)}</h1>
  <p>${escape(subtitle)}</p>
</div>
${window}`,
  )

/** The link preview card: the name and headline beside the browser window, in `lang`. */
export const socialCardHtml = ({
  lang,
  headline,
  subtitle,
  window,
}: {
  readonly lang: string
  readonly headline: string
  readonly subtitle: string
  readonly window: string
}) =>
  page(
    lang,
    SOCIAL_CARD,
    // Larger type than the marquee's: a card is shown at about half its size in a timeline. The
    // text stays clear of the bottom left corner, where X lays the site's domain over the image
    `
body { background: radial-gradient(80% 120% at 0% 0%, #FFFFFF 0%, ${BACKDROP} 65%); }
.brand { position: absolute; left: 72px; top: 0; bottom: 40px; display: flex; flex-direction: column; justify-content: center; width: 470px; }
.brand img { position: static; }
.logo { display: flex; align-items: center; gap: 16px; }
h1 { margin: 34px 0 0; font-size: 54px; line-height: 1.08; font-weight: 700; letter-spacing: -0.028em; }
p { margin: 18px 0 0; color: ${SECONDARY_INK}; font-size: 24px; line-height: 1.4; }
.window { border-radius: 14px 0 0 0; }
`,
    `<div class="brand">
  <div class="logo">${flushIcon(72)}<img src="${WORDMARK}" width="136" alt=""></div>
  <h1>${escape(headline)}</h1>
  <p>${escape(subtitle)}</p>
</div>
${window}`,
  )
