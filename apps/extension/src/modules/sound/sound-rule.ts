import { Schema } from "effect"
import { SoundSite } from "./sound-site"

/**
 * How Katip sends a site's sound to the chosen output.
 *
 * - `InPage`: points the page's own audio and video at the output. It applies by itself every
 *   time the site plays, once the site may use the microphone, which Chrome requires before it
 *   tells a page the names of the outputs.
 * - `Capture`: takes the tab's sound and plays it through the output itself. The site needs no
 *   permission, but Chrome lets Katip start it only after Katip is used on the tab, such as
 *   through one of its keyboard shortcuts.
 */
export const SoundMethod = Schema.Literals(["InPage", "Capture"])
export type SoundMethod = typeof SoundMethod.Type

/** 1 plays at the volume the page sets; up to 5 makes it louder. */
export const SoundVolume = Schema.Finite.pipe(
  Schema.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
)

/** Where a site's sound goes, and how loud it plays. */
export const SoundRule = Schema.Struct({
  site: SoundSite,
  /**
   * The output's name as the system gives it, such as "MacBook Pro Speakers". Not its ID, which
   * Chrome gives each site and Katip differently. null for the system's default output.
   */
  output: Schema.NullOr(Schema.String),
  volume: SoundVolume,
  method: SoundMethod,
})
export type SoundRule = typeof SoundRule.Type
