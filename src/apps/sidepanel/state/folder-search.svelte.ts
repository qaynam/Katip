import type { BookmarkId } from "#platform/browser"
import type { Rect } from "../logic/menu-position"

export interface OpenFolderSearch {
  readonly bookmarkId: BookmarkId
  /** The popover opens below this rect. */
  readonly anchor: Rect
  /** Where focus returns when the popover is closed with Escape. */
  readonly trigger: HTMLElement
}

export class FolderSearchController {
  current = $state.raw<OpenFolderSearch | null>(null)

  open(search: OpenFolderSearch) {
    this.current = search
  }

  close() {
    this.current = null
  }
}
