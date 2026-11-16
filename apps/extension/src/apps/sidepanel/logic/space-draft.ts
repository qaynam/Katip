import type { Translator } from "#modules/i18n"
import { nextSpaceName } from "#modules/space"
import type { SpaceTheme } from "#modules/theme"
import { suggestedTheme } from "./space-themes"

/** The name and theme a new Space starts with while it's being named. */
export interface SpaceDraft {
  readonly name: string
  readonly theme: SpaceTheme
}

/** A numbered name no Space has yet, as the background would give, and a color not used yet. */
export const newSpaceDraft = (
  spaces: ReadonlyArray<{ readonly name: string; readonly theme: SpaceTheme }>,
  translator: Translator,
): SpaceDraft => ({
  name: nextSpaceName(spaces, (n) => translator.t("common.spaceNumbered", { n })),
  theme: suggestedTheme(spaces),
})
