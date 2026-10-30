import { Number } from "effect"

export interface Oklch {
  /** 知覚的な明るさ。0（黒）〜 1（白）。 */
  readonly lightness: number
  readonly chroma: number
  /** 度。 */
  readonly hue: number
}

export interface Rgb {
  readonly red: number
  readonly green: number
  readonly blue: number
}

// 変換式は Björn Ottosson による OKLab の定義（https://bottosson.github.io/posts/oklab/）
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

// 彩度が高すぎて sRGB で表せない色は、各チャンネルを切り詰めると色相がずれる。
// 明るさと色相を保ったまま、表せるところまで彩度だけを下げる
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

/** sRGB（ガンマ補正済み、各 0〜1）に変換する。表せない彩度は明るさと色相を保って下げる。 */
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

/** WCAG 2 の相対輝度。 */
export const relativeLuminance = ({ red, green, blue }: Rgb) =>
  0.2126 * decodeGamma(red) + 0.7152 * decodeGamma(green) + 0.0722 * decodeGamma(blue)

/** WCAG 2 のコントラスト比（1〜21）。 */
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
