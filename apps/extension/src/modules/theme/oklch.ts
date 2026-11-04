import { Number } from "effect"

export interface Oklch {
  /** Perceived lightness, from 0 (black) to 1 (white). */
  readonly lightness: number
  readonly chroma: number
  /** In degrees. */
  readonly hue: number
}

export interface Rgb {
  readonly red: number
  readonly green: number
  readonly blue: number
}

// Conversion as defined for OKLab by Björn Ottosson (https://bottosson.github.io/posts/oklab/)
const toLinearRgb = ({ lightness, chroma, hue }: Oklch): Rgb => {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    red: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    green: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    blue: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

const isInGamut = (rgb: Rgb) =>
  [rgb.red, rgb.green, rgb.blue].every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4)

// Not clipping each channel: for a color too saturated for sRGB, that shifts the hue. Only chroma
// is lowered, as far as needed, keeping lightness and hue
const intoGamut = (color: Oklch): Rgb => {
  if (isInGamut(toLinearRgb(color))) return toLinearRgb(color)
  const search = (low: number, high: number, step: number): number =>
    step === 0
      ? low
      : isInGamut(toLinearRgb({ ...color, chroma: (low + high) / 2 }))
        ? search((low + high) / 2, high, step - 1)
        : search(low, (low + high) / 2, step - 1)
  return toLinearRgb({ ...color, chroma: search(0, color.chroma, 16) })
}

const maxChromaAt = (lightness: number, hue: number) => {
  const search = (low: number, high: number, step: number): number =>
    step === 0
      ? low
      : isInGamut(toLinearRgb({ lightness, chroma: (low + high) / 2, hue }))
        ? search((low + high) / 2, high, step - 1)
        : search(low, (low + high) / 2, step - 1)
  return search(0, 0.4, 20)
}

const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) / 2

/**
 * The most vivid color of a hue that sRGB can show. Yellow's sits near white and blue's far
 * darker, which is why vivid yellows look light and vivid blues deep.
 */
export const cuspOf = (hue: number): Oklch => {
  // How much chroma sRGB allows rises and then falls as lightness goes from black to white, so a
  // golden-section search finds the peak
  const search = (low: number, high: number, step: number): number => {
    if (step === 0) return (low + high) / 2
    const lower = high - (high - low) * GOLDEN_RATIO_CONJUGATE
    const upper = low + (high - low) * GOLDEN_RATIO_CONJUGATE
    return maxChromaAt(lower, hue) < maxChromaAt(upper, hue)
      ? search(lower, high, step - 1)
      : search(low, upper, step - 1)
  }
  const lightness = search(0, 1, 40)
  return { lightness, chroma: maxChromaAt(lightness, hue), hue }
}

const encodeGamma = (channel: number) => {
  const clamped = Number.clamp(channel, { minimum: 0, maximum: 1 })
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
}

/**
 * Converts to sRGB (gamma-encoded, each channel 0 to 1). Chroma that sRGB can't show is lowered,
 * keeping lightness and hue.
 */
export const toSrgb = (color: Oklch): Rgb => {
  const linear = intoGamut(color)
  return {
    red: encodeGamma(linear.red),
    green: encodeGamma(linear.green),
    blue: encodeGamma(linear.blue),
  }
}

const decodeGamma = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

/** WCAG 2 relative luminance. */
export const relativeLuminance = ({ red, green, blue }: Rgb) =>
  0.2126 * decodeGamma(red) + 0.7152 * decodeGamma(green) + 0.0722 * decodeGamma(blue)

/** WCAG 2 contrast ratio, from 1 to 21. */
export const contrastRatio = (a: Rgb, b: Rgb) => {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

const toByte = (channel: number) =>
  Math.round(Number.clamp(channel, { minimum: 0, maximum: 1 }) * 255)

export const rgbCss = (rgb: Rgb, alpha = 1) =>
  alpha === 1
    ? `rgb(${toByte(rgb.red)} ${toByte(rgb.green)} ${toByte(rgb.blue)})`
    : `rgb(${toByte(rgb.red)} ${toByte(rgb.green)} ${toByte(rgb.blue)} / ${alpha})`

const normalizeDegrees = (degrees: number) => ((degrees % 360) + 360) % 360

/** Converts an sRGB color (gamma-encoded, each channel 0 to 1) to OKLCH. Channels outside 0 to 1 are clamped. */
export const fromSrgb = (rgb: Rgb): Oklch => {
  const linear = (channel: number) => decodeGamma(Number.clamp(channel, { minimum: 0, maximum: 1 }))
  const [red, green, blue] = [linear(rgb.red), linear(rgb.green), linear(rgb.blue)]
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    chroma: Math.hypot(a, b),
    hue: normalizeDegrees((Math.atan2(b, a) * 180) / Math.PI),
  }
}
