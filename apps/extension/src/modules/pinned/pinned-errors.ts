import { Schema } from "effect"
import { SpaceId } from "#modules/space"
import { BookmarkId } from "#platform/browser"

/** The Space's pinned tree couldn't be read. Distinct from an empty tree. */
export class PinnedTreeUnavailable extends Schema.TaggedError<PinnedTreeUnavailable>()(
  "PinnedTreeUnavailable",
  { spaceId: SpaceId },
) {}

/**
 * There is no node of the requested kind (bookmark or folder) under Katip's Space folders.
 *
 * Bookmarks outside Katip, a Space folder itself and IDs that don't exist all end up as this.
 */
export class PinnedNodeNotFound extends Schema.TaggedError<PinnedNodeNotFound>()(
  "PinnedNodeNotFound",
  { bookmarkId: BookmarkId },
) {}

export class FolderDepthExceeded extends Schema.TaggedError<FolderDepthExceeded>()(
  "FolderDepthExceeded",
  { depth: Schema.Int, maxDepth: Schema.Int },
) {}

/** A folder was to be moved into itself or into a folder inside it. */
export class MoveIntoDescendant extends Schema.TaggedError<MoveIntoDescendant>()(
  "MoveIntoDescendant",
  { folderId: BookmarkId, parentId: BookmarkId },
) {}
