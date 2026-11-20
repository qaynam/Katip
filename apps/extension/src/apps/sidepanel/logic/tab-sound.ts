import type { Translator } from "#modules/i18n"
import type { TabSoundView } from "#protocol"

/** What a tab's speaker says about where Katip sends its sound. */
export interface SoundNote {
  /** `Routed` plays on the output chosen for it; `Warning` can't reach it yet. */
  readonly tone: "Routed" | "Warning"
  readonly text: string
}

/**
 * The note for a tab whose sound Katip sends to an output. None while the tab plays where the
 * system plays everything else, as it does on the default output or before the page says where
 * its sound went.
 */
export const soundNoteOf = (
  sound: TabSoundView | undefined,
  t: Translator["t"],
): SoundNote | null => {
  if (sound === undefined || sound.output === null) return null
  const { output } = sound
  switch (sound.state) {
    case "Pending":
      return null
    case "Applied":
      return { tone: "Routed", text: t("sidepanel.sound.playingOn", { output }) }
    case "OutputMissing":
      return { tone: "Warning", text: t("sidepanel.sound.outputMissing", { output }) }
    case "NeedsMicrophone":
    case "NeedsAccess":
      return { tone: "Warning", text: t("sidepanel.sound.needsPermission", { output }) }
  }
}
