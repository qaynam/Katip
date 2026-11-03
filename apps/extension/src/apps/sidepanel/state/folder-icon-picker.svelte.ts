import type { BookmarkId } from "#platform/browser"
import type { Rect } from "../logic/menu-position"

export interface OpenFolderIconPicker {
  readonly bookmarkId: BookmarkId
  /** The popover opens below this rect. */
  readonly anchor: Rect
  /** Where focus returns after a choice or when the popover is closed with Escape. */
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
