import type { BookmarkId } from "#platform/browser"
import type { Rect } from "../logic/menu-position"

export interface OpenFolderIconPicker {
  readonly bookmarkId: BookmarkId
  /** 小窓をこの矩形の下に出す */
  readonly anchor: Rect
  /** 選んだときや Escape で閉じたときにフォーカスを戻す先 */
  readonly trigger: HTMLElement
}

export class FolderIconPickerController {
  current = $state.raw<OpenFolderIconPicker | null>(null)

  open(picker: OpenFolderIconPicker) {
    this.current = picker
  }

  close() {
    this.current = null
  }
}
