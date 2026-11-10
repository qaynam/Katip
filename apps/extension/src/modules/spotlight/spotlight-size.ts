import { Schema } from "effect"

/** How large Spotlight opens, and how densely it lists results. */
export const SpotlightSize = Schema.Literals(["Compact", "Normal", "Large"])
export type SpotlightSize = typeof SpotlightSize.Type

/** Spotlight's measurements at one size, in CSS pixels. */
export interface SpotlightLayout {
  /** The window, title bar included, when the window it opens over has room. */
  readonly window: { readonly width: number; readonly height: number }
  readonly searchHeight: number
  /** The least height of a result row. */
  readonly rowHeight: number
}

export const SPOTLIGHT_LAYOUTS: Readonly<Record<SpotlightSize, SpotlightLayout>> = {
  Compact: { window: { width: 560, height: 360 }, searchHeight: 48, rowHeight: 36 },
  Normal: { window: { width: 640, height: 440 }, searchHeight: 60, rowHeight: 48 },
  Large: { window: { width: 780, height: 560 }, searchHeight: 72, rowHeight: 58 },
}
