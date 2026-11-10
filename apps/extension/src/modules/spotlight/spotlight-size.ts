import { Schema } from "effect"

/**
 * How large Spotlight opens. A compact Spotlight shows its search field alone until something is
 * typed, then opens out to the normal size; a large one is wider.
 */
export const SpotlightSize = Schema.Literals(["Compact", "Normal", "Large"])
export type SpotlightSize = typeof SpotlightSize.Type

/** Spotlight's measurements at one size, in CSS pixels. */
export interface SpotlightLayout {
  /** The window, title bar included, when the window it opens over has room. */
  readonly window: { readonly width: number; readonly height: number }
  /** Whether the window shrinks to the search field while nothing is typed. */
  readonly collapses: boolean
}

export const SPOTLIGHT_LAYOUTS: Readonly<Record<SpotlightSize, SpotlightLayout>> = {
  Compact: { window: { width: 640, height: 440 }, collapses: true },
  Normal: { window: { width: 640, height: 440 }, collapses: false },
  Large: { window: { width: 860, height: 500 }, collapses: false },
}

/** The height of Spotlight's search field, which a collapsed window shows alone. */
export const SPOTLIGHT_SEARCH_HEIGHT = 60

/** The least height of a row of results. */
export const SPOTLIGHT_ROW_HEIGHT = 48

/**
 * Where Spotlight opens over the window it is called from: each is the share of the room left
 * around Spotlight that goes before it, 0 at the left or top edge and 1 at the right or bottom.
 */
export const SpotlightPosition = Schema.Struct({
  x: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  y: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
})
export type SpotlightPosition = typeof SpotlightPosition.Type

/**
 * Centered across, and above the middle, so the eye lands on the search field without moving.
 */
export const DEFAULT_SPOTLIGHT_POSITION: SpotlightPosition = { x: 0.5, y: 0.3 }
