import { Schema } from "effect"

/** The script Katip puts into pages of sites it sends to another output, by its path in the build. */
export const PAGE_SOUND_SCRIPT_PATH = "page-sound.js"

/**
 * Where a page's sound went once Katip pointed it at an output.
 *
 * - `Applied`: to `output`, or to the system's default output when it is null.
 * - `OutputMissing`: `output` isn't connected, so the page plays through the default output until
 *   it is.
 * - `NeedsMicrophone`: nowhere else yet. Chrome tells a page the names of the outputs only once the
 *   site may use the microphone.
 */
export const PageSoundStatus = Schema.TaggedUnion({
  Applied: { output: Schema.NullOr(Schema.String) },
  OutputMissing: { output: Schema.String },
  NeedsMicrophone: {},
})
export type PageSoundStatus = typeof PageSoundStatus.Type

/** Sent by the script in a page to the background. */
export const PageSoundReport = Schema.TaggedUnion({
  /** Sent as the page starts, asking which output to use. The reply is a {@link PageSoundOrder}. */
  PageSoundStarted: {},
  /**
   * Sent whenever the page's sound has gone somewhere, as after an output was connected, with the
   * names of the outputs the page could see then. None while the site may not use the microphone.
   */
  PageSoundApplied: { status: PageSoundStatus, outputs: Schema.Array(Schema.String) },
})
export type PageSoundReport = typeof PageSoundReport.Type

/** Sent by the background to the script in a page. */
export const PageSoundOrder = Schema.TaggedUnion({
  /** Points the page's audio and video at `output`, or the default output when it is null. */
  PlayOn: { output: Schema.NullOr(Schema.String) },
  /** Leaves the page's sound to the page again, on the default output. */
  LetGo: {},
})
export type PageSoundOrder = typeof PageSoundOrder.Type
