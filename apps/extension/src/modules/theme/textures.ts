import { Schema } from "effect"

/** The pattern laid over a theme's background, as strong as the theme's grain. */
export const ThemeTexture = Schema.Literals(["grain", "speckle", "film", "lines", "linen", "paper"])
export type ThemeTexture = typeof ThemeTexture.Type

export const DEFAULT_TEXTURE: ThemeTexture = "grain"

/** The texture after `texture`, going round to the first after the last. */
export const nextTexture = (texture: ThemeTexture): ThemeTexture => {
  const all = ThemeTexture.literals
  return all[(all.indexOf(texture) + 1) % all.length] ?? DEFAULT_TEXTURE
}

/** A texture as CSS paints it: one tile, repeated over the background. */
export interface TextureTile {
  /** A CSS `url()` of the tile. */
  readonly image: string
  readonly sizePx: number
  /**
   * How visible the texture is at the same grain, so that each texture reads about as strong. Lines
   * cover every pixel row, where noise leaves most pixels near the background's own color.
   */
  readonly strength: number
}

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

// Luminance into every channel, opacity included
const LUMINANCE = "0.2126 0.7152 0.0722 0 0 ".repeat(4).trim()

/**
 * Turns the luminance of the filter's input into grains seen on any background: the dark half
 * becomes black and the light half white, with the distance from mid-gray as opacity. A plain gray
 * would barely show on a background of about its own lightness.
 */
const toGrains = (opacity: string, isBlackAndWhite = true, contrast = 1) =>
  [
    `<feColorMatrix values='${LUMINANCE}'/>`,
    ...(contrast === 1
      ? []
      : [
          "<feComponentTransfer>",
          `<feFuncA type='linear' slope='${contrast}' intercept='${(1 - contrast) / 2}'/>`,
          "</feComponentTransfer>",
        ]),
    "<feComponentTransfer>",
    ...(isBlackAndWhite
      ? ["R", "G", "B"].map((channel) => `<feFunc${channel} type='discrete' tableValues='0 1'/>`)
      : []),
    `<feFuncA type='table' tableValues='${opacity}'/>`,
    "</feComponentTransfer>",
  ].join("")

const noiseTile = (sizePx: number, filter: string) =>
  svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${sizePx}' height='${sizePx}'>` +
      `<filter id='n' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>` +
      filter +
      "</filter>" +
      "<rect width='100%' height='100%' filter='url(#n)'/>" +
      "</svg>",
  )

const noise = (baseFrequency: string, octaves: number, extra = "") =>
  `<feTurbulence type='fractalNoise' baseFrequency='${baseFrequency}' numOctaves='${octaves}' stitchTiles='stitch'${extra}/>`

const LINE_SPACING_PX = 6

// Black lines with white ones between them, so the lines show on light and dark backgrounds alike.
// Each line runs on past the tile's corner into the next tile, so the tiles join without gaps
const linesTile = svgUrl(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${LINE_SPACING_PX}' height='${LINE_SPACING_PX}'>` +
    "<g stroke-width='0.9' stroke-linecap='square'>" +
    "<path d='M-1 7 L7 -1 M-1 1 L1 -1 M5 7 L7 5' stroke='#000' stroke-opacity='0.75'/>" +
    "<path d='M-1 4 L4 -1 M2 7 L7 2' stroke='#fff' stroke-opacity='0.75'/>" +
    "</g></svg>",
)

const tiles: { readonly [T in ThemeTexture]: TextureTile } = {
  // A baseFrequency well below 1 would spread each grain over two or more device pixels on 2x
  // screens and blur it
  grain: {
    image: noiseTile(200, noise("1.35", 2) + toGrains("1 0 1")),
    sizePx: 200,
    strength: 1,
  },
  // Only the far ends of the noise show, as scattered specks larger than the grain. Noise of one
  // octave seldom strays far from mid-gray, so its contrast is raised first
  speckle: {
    image: noiseTile(200, noise("0.7", 1) + toGrains("1 0.6 0 0 0 0 0.6 1", true, 2)),
    sizePx: 200,
    strength: 1.2,
  },
  // Shades of gray rather than black and white, which softens each grain
  film: {
    image: noiseTile(200, noise("0.55", 2) + toGrains("1 0 1", false)),
    sizePx: 200,
    strength: 1.4,
  },
  lines: { image: linesTile, sizePx: LINE_SPACING_PX, strength: 0.45 },
  // Threads one way and across, from noise stretched along each axis
  linen: {
    image: noiseTile(
      240,
      noise("1.1 0.03", 2, " result='warp'") +
        noise("0.03 1.1", 2, " seed='7' result='weft'") +
        "<feComposite in='warp' in2='weft' operator='arithmetic' k2='0.5' k3='0.5'/>" +
        toGrains("1 0 1"),
    ),
    sizePx: 240,
    strength: 0.9,
  },
  // Soft clouds with a little grain, like the fibers of paper
  paper: {
    image: noiseTile(
      320,
      noise("0.035", 4, " result='clouds'") +
        noise("1.2", 2, " seed='3' result='fibers'") +
        "<feComposite in='clouds' in2='fibers' operator='arithmetic' k2='0.45' k3='0.55'/>" +
        toGrains("0.7 0 0.7", false),
    ),
    sizePx: 320,
    strength: 2,
  },
}

export const textureTileOf = (texture: ThemeTexture): TextureTile => tiles[texture]
