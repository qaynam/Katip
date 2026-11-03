import type { SpaceId } from "#modules/space"
import type { Rect } from "../logic/menu-position"

export interface OpenThemePicker {
  readonly spaceId: SpaceId
  readonly anchor: Rect
  /** When opened together with renaming, it doesn't take focus away from the name input. */
  readonly takesFocus: boolean
}

export class ThemePickerController {
  current = $state.raw<OpenThemePicker | null>(null)

  open(picker: OpenThemePicker) {
    this.current = picker
  }

  close() {
    this.current = null
  }
}
