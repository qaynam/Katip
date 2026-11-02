import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import opentype from "opentype.js"

/** "Katip" set in Inter SemiBold, as outlines, so it renders the same where Inter isn't installed. */
export interface Wordmark {
  /** Path data with the top of the ink at y = 0 and its left edge at x = 0. */
  readonly path: string
  readonly width: number
  /** Height of the ink, from the top of the tallest glyph to the bottom of the descender. */
  readonly height: number
  /** Distance from the top of the ink to the baseline. */
  readonly ascent: number
}

const require = createRequire(import.meta.url)
// Not WOFF2: opentype.js reads TrueType, OpenType and WOFF, but cannot decompress WOFF2
const fontFile = readFileSync(
  require.resolve("@fontsource/inter/files/inter-latin-600-normal.woff"),
)
// Not `fontFile.buffer` as is: Node may hand out a slice of a shared pool, whose ArrayBuffer also
// holds other data
const font = opentype.parse(
  fontFile.buffer.slice(fontFile.byteOffset, fontFile.byteOffset + fontFile.byteLength),
)

const TEXT = "Katip"
// Tight tracking, as display sizes of Inter are usually set, so the name reads as one shape
const TRACKING_EM = -0.035

export const wordmark = (fontSize: number): Wordmark => {
  const scale = fontSize / font.unitsPerEm
  // Not stringToGlyphs: it applies Inter's substitution lookups, some of which opentype.js can't
  // run, and "Katip" needs no ligatures or contextual forms
  const glyphs = [...TEXT].map((character) => font.charToGlyph(character))
  const pens = glyphs.reduce<ReadonlyArray<number>>(
    (xs, glyph, index) => {
      const next = glyphs[index + 1]
      if (next === undefined) return xs
      const advance =
        (glyph.advanceWidth ?? 0) * scale +
        font.getKerningValue(glyph, next) * scale +
        TRACKING_EM * fontSize
      return [...xs, (xs.at(-1) ?? 0) + advance]
    },
    [0],
  )
  const outline = (dx: number, dy: number) => {
    const path = new opentype.Path()
    glyphs.forEach((glyph, index) =>
      path.extend(glyph.getPath((pens[index] ?? 0) + dx, dy, fontSize)),
    )
    return path
  }
  const { x1, y1, x2, y2 } = outline(0, 0).getBoundingBox()
  return {
    path: outline(-x1, -y1).toPathData(2),
    width: x2 - x1,
    height: y2 - y1,
    ascent: -y1,
  }
}
