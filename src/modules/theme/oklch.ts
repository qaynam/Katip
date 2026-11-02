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
