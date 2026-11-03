import type { SpaceId } from "#modules/space"
import type { BookmarkId } from "#platform/browser"
import type { LiveSourceKind } from "../logic/live-folders"

export type LiveFolderDialogRequest =
  | {
      readonly _tag: "Create"
      readonly kind: LiveSourceKind
      readonly spaceId: SpaceId
      /** null places it at the top level of the Space. */
      readonly parentId: BookmarkId | null
    }
  /**
   * Sets a new token for a live folder that couldn't refresh because its token was missing
   * or invalid, then refreshes it.
   */
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
