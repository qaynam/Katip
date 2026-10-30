import type { SpaceId } from "#modules/space"
import type { BookmarkId } from "#platform/browser"
import type { LiveSourceKind } from "../logic/live-folders"

export type LiveFolderDialogRequest =
  | {
      readonly _tag: "Create"
      readonly kind: LiveSourceKind
      readonly spaceId: SpaceId
      /** null は Space 直下 */
      readonly parentId: BookmarkId | null
    }
  /** トークンが無いか無効で取得できなかったライブフォルダに、トークンを入れ直して取得し直す */
  | { readonly _tag: "SetGitHubToken"; readonly bookmarkId: BookmarkId }

export class LiveFolderDialogController {
  current = $state.raw<LiveFolderDialogRequest | null>(null)

  open(request: LiveFolderDialogRequest) {
    this.current = request
  }

  close() {
    this.current = null
  }
}
