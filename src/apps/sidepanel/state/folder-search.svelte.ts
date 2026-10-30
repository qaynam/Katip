import type { BookmarkId } from "#platform/browser"
import type { Rect } from "../logic/menu-position"

export interface OpenFolderSearch {
  readonly bookmarkId: BookmarkId
  /** 小窓をこの矩形の下に出す */
  readonly anchor: Rect
  /** Escape で閉じたときにフォーカスを戻す先 */
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
