import { iconSvg } from "./icon.ts"
import { wordmark } from "./wordmark.ts"

/** Text colors for light and dark backgrounds, matching GitHub's default text in each theme. */
export const INK = { light: "#1d1d1f", dark: "#f0f6fc" } as const
export type Ink = keyof typeof INK

// The icon's own 1024-unit grid leaves a 100-unit margin around the squircle
const ICON_MARGIN = 100 / 1024

const nestedIcon = (x: number, y: number, size: number) =>
  iconSvg({ layout: "grid" }).replace(
    ' width="1024" height="1024"',
    ` x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size}" height="${size}"`,
  )

const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" width="${Math.ceil(width)}" height="${Math.ceil(height)}">\n${body}\n</svg>\n`

const text = (x: number, y: number, fontSize: number, ink: Ink) => {
  const mark = wordmark(fontSize)
  return {
    mark,
    element: `<path transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" fill="${INK[ink]}" d="${mark.path}"/>`,
  }
}

/** The icon above the name, centered; the README header. */
export const stackedLogoSvg = (ink: Ink): string => {
  const iconSize = 512
  const mark = wordmark(150)
  const width = Math.max(iconSize, mark.width + 48)
  const squircleBottom = iconSize * (1 - ICON_MARGIN)
  const textTop = squircleBottom + 44
  const name = text((width - mark.width) / 2, textTop, 150, ink)
  return svg(
    width,
    textTop + mark.height + 24,
    `${nestedIcon((width - iconSize) / 2, 0, iconSize)}\n${name.element}`,
  )
}

/** The icon beside the name, for headers and banners. */
export const horizontalLogoSvg = (ink: Ink): string => {
  const iconSize = 256
  const fontSize = 118
  const mark = wordmark(fontSize)
  const squircleLeft = iconSize * ICON_MARGIN
  const textLeft = iconSize - squircleLeft + 36
  // Center the ink of the name on the squircle; its descender would pull a baseline-based layout up
  const name = text(textLeft, (iconSize - mark.height) / 2, fontSize, ink)
  return svg(
    textLeft + mark.width + squircleLeft,
    iconSize,
    `${nestedIcon(0, 0, iconSize)}\n${name.element}`,
  )
}

/** The name alone. */
export const wordmarkSvg = (ink: Ink): string => {
  const fontSize = 150
  const pad = 8
  const mark = wordmark(fontSize)
  return svg(mark.width + pad * 2, mark.height + pad * 2, text(pad, pad, fontSize, ink).element)
}
