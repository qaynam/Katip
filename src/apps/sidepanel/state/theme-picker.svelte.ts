import type { SpaceId } from "#modules/space"
import type { Rect } from "../logic/menu-position"

export interface OpenThemePicker {
  readonly spaceId: SpaceId
  readonly anchor: Rect
  /** 名前の編集と同時に開くときは、入力欄からフォーカスを奪わない */
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
